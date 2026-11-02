import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPackageVersions, applyRemappings, autoRemappings, declaresDeployable, externalUrl, parseGitmodules, parseImports, parseRemapping, resolveImportPath, splitPackagePath } from "./imports";
import { parseFoundryToml, parseHardhatConfig, settingsCandidates } from "./config";
import { fetchRepoFiles, isWantedPath, parseAdvertisedRefs, parsePktLines, resolveRef, safeEntryPath, validateRepo } from "./github";
import { compareRuntime, maskRanges, solcVersionFromMetadata, splitMetadata } from "./metadata";
import { isCompileRoot } from "./index";

// ---- helpers: a realistic solc 0.8.19 runtime with ipfs metadata ----
const ipfs = (fill: string) => "12" + "20" + fill.repeat(32);
const metadata = (fill: string, solc = "000813") =>
  "a2" + "64" + "69706673" + "5822" + ipfs(fill) + "64" + "736f6c63" + "43" + solc;
const withTrailer = (body: string, meta: string) => body + meta + (meta.length / 2).toString(16).padStart(4, "0");

describe("metadata split", () => {
  const body = "608060405234801561001057600080fd5b50";
  const full = "0x" + withTrailer(body, metadata("ab"));

  it("splits body and trailer and reads the solc version", () => {
    const s = splitMetadata(full);
    expect(s.body).toBe(body);
    expect(s.trailer).toBe(metadata("ab") + "0033");
    expect(solcVersionFromMetadata(s.decoded)).toBe("0.8.19");
  });
  it("returns no metadata for plain code, bad lengths and non-cbor tails", () => {
    expect(splitMetadata("0x6080604052").decoded).toBeNull();
    expect(splitMetadata("0x" + body + "ffff").decoded).toBeNull();
    expect(splitMetadata("0x" + body + "0000").decoded).toBeNull();
    expect(splitMetadata("0x").decoded).toBeNull();
    expect(splitMetadata("0xzz").decoded).toBeNull();
    expect(splitMetadata("0x" + "00".repeat(8) + "0004").decoded).toBeNull();
  });
  it("has no solc version when the field is missing", () => {
    expect(solcVersionFromMetadata({ ipfs: new Uint8Array(1) })).toBeNull();
    expect(solcVersionFromMetadata(null)).toBeNull();
  });
});

describe("masking", () => {
  it("zeroes only the given byte ranges", () => {
    expect(maskRanges("aabbccddeeff", [{ start: 1, length: 2 }])).toBe("aa0000ddeeff");
    expect(maskRanges("aabb", [{ start: 1, length: 9 }])).toBe("aa00");
    expect(maskRanges("aabb", [])).toBe("aabb");
  });
});

describe("compareRuntime", () => {
  const b = "6080604052" + "7f" + "11".repeat(32) + "5b00";
  const chain = (body: string, fill = "ab") => "0x" + withTrailer(body, metadata(fill));
  const local = (body: string, fill = "ab", extra: object = {}) => ({
    object: withTrailer(body, metadata(fill)),
    immutableRefs: [],
    linkRefs: [],
    ...extra,
  });

  it("exact when body and metadata are equal", () => {
    expect(compareRuntime(local(b), chain(b))).toBe("exact");
  });
  it("code when only the metadata hash differs", () => {
    expect(compareRuntime(local(b, "cd"), chain(b, "ab"))).toBe("code");
  });
  it("never matches different executable code", () => {
    const other = b.replace("5b00", "5b01");
    expect(compareRuntime(local(other), chain(b))).toBeNull();
    expect(compareRuntime(local(b + "00"), chain(b))).toBeNull();
  });
  it("masks immutable slots on both sides", () => {
    const withImm = b.replace("11".repeat(32), "22".repeat(32));
    const refs = [{ start: 6, length: 32 }];
    expect(compareRuntime(local(b, "ab", { immutableRefs: refs }), chain(withImm))).toBe("exact");
    // without the mask the same difference is a mismatch
    expect(compareRuntime(local(b), chain(withImm))).toBeNull();
    // a difference outside the masked range is still a mismatch
    expect(compareRuntime(local(b, "ab", { immutableRefs: [{ start: 6, length: 16 }] }), chain(withImm))).toBeNull();
  });
  it("masks library link placeholders", () => {
    const placeholder = "__$" + "a".repeat(34) + "$__";
    const lb = "6080" + placeholder + "5b00";
    const onchain = "6080" + "ee".repeat(20) + "5b00";
    const linkRefs = [{ start: 2, length: 20 }];
    expect(compareRuntime({ object: withTrailer(lb, metadata("ab")), immutableRefs: [], linkRefs }, chain(onchain))).toBe("exact");
    expect(compareRuntime({ object: withTrailer(lb, metadata("ab")), immutableRefs: [], linkRefs: [] }, chain(onchain))).toBeNull();
  });
  it("refuses when the chain code has no metadata", () => {
    expect(compareRuntime(local(b), "0x" + b)).toBeNull();
  });
});

describe("pkt-line and refs", () => {
  const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, "0") + s;
  const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
  const advert =
    pkt("# service=git-upload-pack\n") + "0000" +
    pkt(`${A} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/github\n`) +
    pkt(`${A} refs/heads/main\n`) +
    pkt(`${B} refs/heads/dev\n`) +
    pkt(`${C} refs/tags/v1\n`) +
    pkt(`${D} refs/tags/v1^{}\n`) +
    pkt(`${B} refs/tags/dev\n`) +
    "0000";
  const refs = parseAdvertisedRefs(parsePktLines(Buffer.from(advert)));

  it("parses pkt-lines including flush", () => {
    const p = parsePktLines(Buffer.from(advert));
    expect(p[0].kind).toBe("data");
    expect(p[1].kind).toBe("flush");
    expect(p[p.length - 1].kind).toBe("flush");
  });
  it("rejects malformed framing", () => {
    expect(() => parsePktLines(Buffer.from("00zz"))).toThrow();
    expect(() => parsePktLines(Buffer.from("0010abc"))).toThrow();
    expect(() => parsePktLines(Buffer.from("00"))).toThrow();
  });
  it("resolves HEAD, branches, tags and prefers the peeled tag", () => {
    expect(refs.length).toBe(6);
    expect(resolveRef(refs, undefined)).toBe(A);
    expect(resolveRef(refs, "HEAD")).toBe(A);
    expect(resolveRef(refs, "dev")).toBe(B); // tag and branch agree here
    expect(resolveRef(refs, "v1")).toBe(D);
    expect(resolveRef(refs, "refs/heads/dev")).toBe(B);
    expect(resolveRef(refs, "nope")).toBeNull();
    expect(resolveRef(refs, "E".repeat(40))).toBe("e".repeat(40));
  });
  it("handles an empty repo", () => {
    expect(parseAdvertisedRefs(parsePktLines(Buffer.from(pkt("# service=git-upload-pack\n") + "0000" + "0000")))).toEqual([]);
  });
});

describe("repo validation", () => {
  it("accepts owner/name", () => {
    expect(validateRepo("Firzadf/nodescope")).toEqual({ owner: "Firzadf", name: "nodescope" });
    expect(validateRepo("a/b.c_d-e")).not.toBeNull();
  });
  it("refuses URLs, extra segments, traversal and odd characters", () => {
    for (const bad of [
      "https://github.com/a/b", "github.com/a/b", "a/b/c", "a", "", "/a/b", "a/", "../x", "a/..", "a/.", "-a/b", "a-/b/c",
      "a/b?x=1", "a/b#frag", "a b/c", "a/b c", "a@evil.com/b", "evil.com:80/a", "a/b.git", "a/b\\c", "a/b%2e", "a/\u0431", "x".repeat(40) + "/n",
    ]) expect(validateRepo(bad), bad).toBeNull();
    expect(validateRepo(undefined as unknown as string)).toBeNull();
  });
});

describe("archive paths", () => {
  it("strips the root folder and refuses traversal", () => {
    expect(safeEntryPath("repo-abc/src/A.sol")).toBe("src/A.sol");
    expect(safeEntryPath("repo-abc/")).toBeNull();
    expect(safeEntryPath("repo-abc/../../evil.sol")).toBeNull();
    expect(safeEntryPath("../evil.sol")).toBeNull();
    expect(safeEntryPath("/etc/passwd")).toBeNull();
    expect(safeEntryPath("C:/x/y.sol")).toBeNull();
    expect(safeEntryPath("repo\\..\\x.sol")).toBeNull();
    expect(safeEntryPath("repo/a\0b.sol")).toBeNull();
  });
  it("wants only sources and config", () => {
    for (const ok of ["src/A.sol", "foundry.toml", "a/package.json", "package-lock.json", "remappings.txt", ".gitmodules", "hardhat.config.ts"]) expect(isWantedPath(ok), ok).toBe(true);
    for (const no of ["node_modules/x/A.sol", "src/a.js", "README.md", ".git/config", "a/node_modules/package.json", "image.png"]) expect(isWantedPath(no), no).toBe(false);
  });
  it("compile roots skip tests, scripts, build output and dependencies", () => {
    for (const ok of ["src/A.sol", "contracts/sub/B.sol"]) expect(isCompileRoot(ok), ok).toBe(true);
    for (const no of ["test/A.sol", "tests/A.sol", "script/D.sol", "scripts/D.sol", "out/A.sol", "artifacts/A.sol", "cache/A.sol", "node_modules/A.sol", "src/A.t.sol", "src/Deploy.s.sol", "lib/x/A.sol"]) expect(isCompileRoot(no), no).toBe(false);
  });
});

function tarEntry(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const h = Buffer.alloc(512);
  h.write(name, 0, "utf8");
  h.write("0000644\0", 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
  h.write("00000000000\0", 136);
  h.write("        ", 148);
  h.write("0", 156);
  h.write("ustar\0" + "00", 257);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([h, data, pad]);
}

describe("archive extraction (offline, fetch stubbed)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const sha = "1".repeat(40);

  it("writes wanted files, ignores traversal and unwanted files, reports the root sha", async () => {
    const root = `repo-${sha}`;
    const tar = Buffer.concat([
      tarEntry(`${root}/src/A.sol`, "contract A {}"),
      tarEntry(`${root}/../evil.sol`, "contract Evil {}"),
      tarEntry(`${root}/../../evil2.sol`, "contract Evil2 {}"),
      tarEntry(`${root}/src/../../../evil3.sol`, "contract Evil3 {}"),
      tarEntry(`${root}/node_modules/x/B.sol`, "contract B {}"),
      tarEntry(`${root}/README.md`, "hi"),
      tarEntry(`${root}/foundry.toml`, "[profile.default]\n"),
      Buffer.alloc(1024),
    ]);
    vi.stubGlobal("fetch", async () => new Response(gzipSync(tar), { status: 200 }));
    const dir = await mkdtemp(join(tmpdir(), "osc-test-"));
    try {
      const r = await fetchRepoFiles("a/b", sha, dir);
      expect(r.rootSha).toBe(sha);
      expect(r.files.sort()).toEqual(["foundry.toml", "src/A.sol"]);
      expect(await readFile(join(dir, "src", "A.sol"), "utf8")).toBe("contract A {}");
      expect(existsSync(join(dir, "..", "evil.sol"))).toBe(false);
      expect(existsSync(join(dir, "..", "..", "evil2.sol"))).toBe(false);
      expect(existsSync(join(dir, "node_modules"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses an archive larger than the cap as repo_too_large", async () => {
    vi.stubGlobal("fetch", async () => new Response(gzipSync(Buffer.alloc(200_000, 7)), { status: 200 }));
    const dir = await mkdtemp(join(tmpdir(), "osc-test-"));
    try {
      await expect(fetchRepoFiles("a/b", sha, dir, 100)).rejects.toMatchObject({ reason: "repo_too_large" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("maps 404 to repo_not_found and never requests a host other than GitHub", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { urls.push(String(u)); return new Response("nope", { status: 404 }); });
    const dir = await mkdtemp(join(tmpdir(), "osc-test-"));
    try {
      await expect(fetchRepoFiles("a/b", sha, dir)).rejects.toMatchObject({ reason: "repo_not_found" });
      await expect(fetchRepoFiles("https://evil.com/x", sha, dir)).rejects.toMatchObject({ reason: "repo_not_found" });
      expect(urls).toEqual([`https://codeload.github.com/a/b/tar.gz/${sha}`]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("imports", () => {
  it("parses every import form and ignores comments", () => {
    const src = `
      // import "./commented.sol";
      /* import "./block.sol"; */
      import "./a.sol";
      import './b.sol' as B;
      import {X, Y as Z} from "../c.sol";
      import * as All from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
      string s = "import 'nope.sol';";
    `;
    expect(parseImports(src)).toEqual(["./a.sol", "./b.sol", "../c.sol", "@openzeppelin/contracts/token/ERC20/ERC20.sol"]);
  });
  it("detects deployable declarations", () => {
    expect(declaresDeployable("contract A {}")).toBe(true);
    expect(declaresDeployable("library L {}")).toBe(true);
    expect(declaresDeployable("abstract contract A {}")).toBe(false);
    expect(declaresDeployable("interface I {}\n// contract Z {}")).toBe(false);
    expect(declaresDeployable("abstract contract A {}\ncontract B is A {}")).toBe(true);
  });
  it("resolves relative paths like solc and refuses escapes", () => {
    expect(resolveImportPath("./B.sol", "src/A.sol", [])).toBe("src/B.sol");
    expect(resolveImportPath("../lib/C.sol", "src/A.sol", [])).toBe("lib/C.sol");
    expect(resolveImportPath("../../x.sol", "src/A.sol", [])).toBeNull();
    expect(resolveImportPath("../utils/Context.sol", "@openzeppelin/contracts/access/Ownable.sol", [])).toBe("@openzeppelin/contracts/utils/Context.sol");
    expect(resolveImportPath("/abs.sol", "src/A.sol", [])).toBeNull();
  });
  it("applies remappings: longest prefix, context aware", () => {
    const rs = ["@oz/=lib/oz/", "@oz/contracts/=lib/oz/contracts/", "src/x:@oz/=lib/other/"].map(parseRemapping).filter((r) => r !== null);
    expect(applyRemappings("@oz/contracts/A.sol", "src/A.sol", rs)).toBe("lib/oz/contracts/A.sol");
    expect(applyRemappings("@oz/B.sol", "src/A.sol", rs)).toBe("lib/oz/B.sol");
    expect(applyRemappings("@oz/B.sol", "src/x/A.sol", rs)).toBe("lib/other/B.sol");
    expect(applyRemappings("plain/A.sol", "src/A.sol", rs)).toBe("plain/A.sol");
  });
  it("reads .gitmodules and builds only GitHub urls", () => {
    const subs = parseGitmodules(`[submodule "lib/oz"]\n\tpath = lib/openzeppelin-contracts\n\turl = https://github.com/OpenZeppelin/openzeppelin-contracts\n[submodule "lib/evil"]\n\tpath = lib/evil\n\turl = https://evil.example.com/x/y\n[submodule "lib/ssh"]\n\tpath = lib/forge-std\n\turl = git@github.com:foundry-rs/forge-std.git\n\tbranch = v1`);
    expect(subs).toEqual([
      { path: "lib/openzeppelin-contracts", repo: "OpenZeppelin/openzeppelin-contracts", branch: null },
      { path: "lib/forge-std", repo: "foundry-rs/forge-std", branch: "v1" },
    ]);
    expect(externalUrl("lib/openzeppelin-contracts/contracts/A.sol", subs, new Map())).toBe("https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/HEAD/contracts/A.sol");
    expect(externalUrl("lib/evil/A.sol", subs, new Map())).toBeNull();
    expect(externalUrl("lib/openzeppelin-contracts/../../x", subs, new Map())).toBeNull();
    const auto = autoRemappings(subs, []);
    expect(auto.find((r) => r.prefix === "@openzeppelin/contracts/")?.target).toBe("lib/openzeppelin-contracts/contracts/");
  });
  it("builds npm urls from lock, then package.json, then latest; never from unknown bare names", () => {
    const v = collectPackageVersions([
      { path: "package.json", text: JSON.stringify({ dependencies: { "@openzeppelin/contracts": "^4.9.0", "@x/y": "^1.0.0", bare: "2.0.0" } }) },
      { path: "package-lock.json", text: JSON.stringify({ packages: { "node_modules/@openzeppelin/contracts": { version: "4.9.6" }, "node_modules/a/node_modules/@x/y": { version: "9.9.9" } } }) },
    ]);
    expect(externalUrl("@openzeppelin/contracts/token/ERC20/ERC20.sol", [], v)).toBe("https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.9.6/token/ERC20/ERC20.sol");
    expect(externalUrl("@x/y/z.sol", [], v)).toBe("https://cdn.jsdelivr.net/npm/@x/y@1.0.0/z.sol");
    expect(externalUrl("@new/pkg/z.sol", [], v)).toBe("https://cdn.jsdelivr.net/npm/@new/pkg@latest/z.sol");
    expect(externalUrl("bare/z.sol", [], v)).toBe("https://cdn.jsdelivr.net/npm/bare@2.0.0/z.sol");
    expect(externalUrl("contracts/Local.sol", [], v)).toBeNull();
    expect(externalUrl("@x/y/../../z.sol", [], v)).toBeNull();
    expect(splitPackagePath("@a/b")).toBeNull();
  });
});

describe("settings", () => {
  it("parses foundry.toml and hardhat config as text", () => {
    const f = parseFoundryToml(`# c\n[profile.default]\nsrc = "src"\noptimizer = true\noptimizer_runs = 1_000\nvia_ir = false\nevm_version = "paris"\nremappings = [\n  "@oz/=lib/oz/",\n  'a/=b/'\n]\n[profile.ci]\noptimizer = false\n`);
    expect(f).toMatchObject({ optimizer: true, runs: 1000, viaIR: false, evmVersion: "paris" });
    expect(f.remappings).toEqual(["@oz/=lib/oz/", "a/=b/"]);
    const h = parseHardhatConfig(`module.exports = { solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 777 }, viaIR: true, evmVersion: 'shanghai' } } }`);
    expect(h).toEqual({ optimizer: true, runs: 777, viaIR: true, evmVersion: "shanghai", solcVersion: "0.8.20" });
    expect(parseHardhatConfig("require('x'); process.exit(1)")).toEqual({});
  });
  it("orders candidates: repo settings first, then the fixed ladder", () => {
    const labels = settingsCandidates("0.8.28", { optimizer: true, runs: 999 }).map((c) => c.label);
    expect(labels).toEqual([
      "optimizer 999", "optimizer 200", "optimizer off", "optimizer 1", "optimizer 1000", "optimizer 10000",
      "optimizer 200, evm paris", "optimizer 200, evm london", "optimizer 200, evm shanghai", "optimizer 200, evm cancun", "optimizer 1, evm paris",
      "optimizer 200, viaIR", "optimizer 1, viaIR", "optimizer 1, viaIR, evm paris", "optimizer 200, viaIR, evm paris",
    ]);
    // repo settings equal to a ladder entry are not tried twice
    expect(settingsCandidates("0.8.28", { optimizer: true, runs: 200 })).toHaveLength(14);
    // settings the compiler cannot accept are dropped
    const old = settingsCandidates("0.8.6", null).map((c) => c.label);
    expect(old).toEqual(["optimizer 200", "optimizer off", "optimizer 1", "optimizer 1000", "optimizer 10000"]);
  });
});

import { excludingPragma, parsePragmas, satisfiesPragma } from "./pragma";

describe("pragma", () => {
  it("evaluates solidity version ranges", () => {
    const ok: [string, string][] = [["^0.8.20", "0.8.24"], [">=0.8.0 <0.9.0", "0.8.24"], ["0.8.24", "0.8.24"], ["~0.8.20", "0.8.24"], [">=0.7.0", "0.8.24"], ["^0.7.0 || ^0.8.0", "0.8.24"], ["0.8", "0.8.24"], [">= 0.8.0", "0.8.24"]];
    const no: [string, string][] = [["^0.8.25", "0.8.24"], ["^0.7.0", "0.8.24"], ["0.8.23", "0.8.24"], ["<0.8.24", "0.8.24"], ["~0.8.25", "0.8.24"], [">0.8.24", "0.8.24"], [">=0.4.22 <0.8.0", "0.8.24"]];
    for (const [r, v] of ok) expect(satisfiesPragma(r, v), `${r} ${v}`).toBe(true);
    for (const [r, v] of no) expect(satisfiesPragma(r, v), `${r} ${v}`).toBe(false);
  });
  it("reads pragmas ignoring comments and finds the excluding one", () => {
    expect(parsePragmas("// pragma solidity ^0.4.0;\npragma solidity ^0.8.20;")).toEqual(["^0.8.20"]);
    expect(excludingPragma(["pragma solidity ^0.8.20;", "pragma solidity ^0.7.0;"], "0.8.24")).toBe("^0.7.0");
    expect(excludingPragma(["contract A {}"], "0.8.24")).toBeNull();
  });
});
