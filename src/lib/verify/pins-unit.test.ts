import { afterEach, describe, expect, it, vi } from "vitest";
import { isWantedPath } from "./github";
import { parseGitlink, readGitlink } from "./gitlink";
import { collectPackagePins, externalSource, isExactVersion } from "./imports";
import { guessNote, negativeVerdict } from "./verdict";

const SHA = "69c8def5f222ff96f2b5beff05dfba996368aa79";

describe("gitlink (pinned submodule commit) parsing", () => {
  it("accepts only real submodule entries with a full sha", () => {
    expect(parseGitlink({ type: "submodule", sha: SHA, submodule_git_url: "https://github.com/OpenZeppelin/openzeppelin-contracts" })).toBe(SHA);
    expect(parseGitlink({ type: "submodule", sha: SHA })).toBe(SHA);
    expect(parseGitlink({ type: "file", sha: SHA, submodule_git_url: "https://x" })).toBe(SHA);
    expect(parseGitlink({ type: "file", sha: SHA })).toBeNull(); // a plain file is not a gitlink
    expect(parseGitlink({ type: "dir", sha: SHA })).toBeNull();
    expect(parseGitlink({ type: "submodule", sha: "abc" })).toBeNull();
    expect(parseGitlink({ type: "submodule", sha: SHA.toUpperCase() })).toBeNull();
    expect(parseGitlink([{ type: "submodule", sha: SHA }])).toBeNull();
    expect(parseGitlink(null)).toBeNull();
    expect(parseGitlink("x")).toBeNull();
  });
});

describe("readGitlink never throws and reports why it could not read", () => {
  afterEach(() => vi.unstubAllGlobals());
  const commit = "1".repeat(40);

  it("reads the pin and sends only a GitHub contents API request", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify({ type: "submodule", sha: SHA }), { status: 200 });
    });
    expect(await readGitlink("lazydevpro/reachpot", "contracts/lib/openzeppelin-contracts", commit)).toEqual({ sha: SHA });
    expect(urls).toEqual([`https://api.github.com/repos/lazydevpro/reachpot/contents/contracts/lib/openzeppelin-contracts?ref=${commit}`]);
  });
  it("rate limit, server error, network failure and bad input give a note, never a sha", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    expect(await readGitlink("a/b", "lib/x", commit)).toMatchObject({ note: expect.stringMatching(/rate limit/i) });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    expect(await readGitlink("a/b", "lib/x2", commit)).toHaveProperty("note");
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    expect(await readGitlink("a/b", "lib/x3", commit)).toHaveProperty("note");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ type: "file", sha: SHA }), { status: 200 }));
    expect(await readGitlink("a/b", "lib/x4", commit)).toMatchObject({ note: expect.stringMatching(/gitlink/) });
    const never = vi.fn();
    vi.stubGlobal("fetch", never);
    expect(await readGitlink("https://evil.com/x", "lib/x", commit)).toHaveProperty("note");
    expect(await readGitlink("a/b", "lib/../../etc", commit)).toHaveProperty("note");
    expect(await readGitlink("a/b", "lib/x", "main")).toHaveProperty("note");
    expect(never).not.toHaveBeenCalled();
  });
});

describe("pinned vs guessed dependencies", () => {
  const subsPinned = [{ path: "lib/oz", repo: "OpenZeppelin/openzeppelin-contracts", branch: null, pin: SHA }];
  const subsUnpinned = [{ path: "lib/oz", repo: "OpenZeppelin/openzeppelin-contracts", branch: null, pin: null }];

  it("submodule: pinned fetches at the sha and is not a guess; unread pin falls back to HEAD and is a guess", () => {
    expect(externalSource("lib/oz/contracts/A.sol", subsPinned, new Map())).toEqual({
      url: `https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/${SHA}/contracts/A.sol`,
      guess: null,
    });
    const g = externalSource("lib/oz/contracts/A.sol", subsUnpinned, new Map());
    expect(g?.url).toBe("https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/HEAD/contracts/A.sol");
    expect(g?.guess).toMatch(/pinned commit could not be read/);
  });

  it("npm: a lock entry or an exact package.json version is pinned; a range or nothing is a guess", () => {
    const { versions, pinned } = collectPackagePins([
      { path: "package.json", text: JSON.stringify({ dependencies: { "@a/locked": "^1.0.0", "@a/exact": "2.3.4", "@a/range": "^3.1.0", "@a/star": "*" } }) },
      { path: "package-lock.json", text: JSON.stringify({ packages: { "node_modules/@a/locked": { version: "1.2.3" } } }) },
    ]);
    expect(versions.get("@a/locked")).toBe("1.2.3");
    expect([...pinned].sort()).toEqual(["@a/exact", "@a/locked"]);
    const src = (k: string) => externalSource(k, [], versions, pinned);
    expect(src("@a/locked/x.sol")).toMatchObject({ url: "https://cdn.jsdelivr.net/npm/@a/locked@1.2.3/x.sol", guess: null });
    expect(src("@a/exact/x.sol")).toMatchObject({ url: "https://cdn.jsdelivr.net/npm/@a/exact@2.3.4/x.sol", guess: null });
    expect(src("@a/range/x.sol")?.guess).toMatch(/range and there is no lock file/);
    expect(src("@a/range/x.sol")?.url).toBe("https://cdn.jsdelivr.net/npm/@a/range@3.1.0/x.sol");
    expect(src("@a/star/x.sol")?.guess).toMatch(/latest/);
    expect(src("@unknown/pkg/x.sol")?.guess).toMatch(/latest/);
    expect(src("@unknown/pkg/x.sol")?.url).toContain("@latest/");
  });

  it("a package.json range without a lock file counts as guessed", () => {
    expect(isExactVersion("4.9.6")).toBe(true);
    expect(isExactVersion("=4.9.6")).toBe(true);
    for (const r of ["^4.9.0", "~4.9.0", ">=4.0.0", "*", "latest", "4.x", "4.9.0 - 5.0.0"]) expect(isExactVersion(r), r).toBe(false);
  });
});

describe("what a failed comparison may be called", () => {
  it("no_match only when the search was complete and every dependency was pinned", () => {
    expect(negativeVerdict({ complete: true, anyCompiled: true, guessed: [] })).toBe("no_match");
    expect(negativeVerdict({ complete: true, anyCompiled: true, guessed: ["x"] })).toBe("inconclusive");
    expect(negativeVerdict({ complete: false, anyCompiled: true, guessed: [] })).toBe("inconclusive");
    expect(negativeVerdict({ complete: false, anyCompiled: true, guessed: ["x"] })).toBe("inconclusive");
    expect(negativeVerdict({ complete: true, anyCompiled: false, guessed: [] })).toBe("compile_failed");
    expect(negativeVerdict({ complete: false, anyCompiled: false, guessed: [] })).toBe("inconclusive");
  });
  it("names the guesses", () => {
    expect(guessNote(["a", "b"])).toContain("2 dependency version(s)");
    expect(guessNote(["a", "b"])).toContain("a; b");
  });
});

describe("yul sources are noticed", () => {
  it("extracts .yul files but still not from node_modules", () => {
    expect(isWantedPath("contracts/PotKit.yul")).toBe(true);
    expect(isWantedPath("node_modules/x/A.yul")).toBe(false);
  });
});

describe("negativeVerdict with source files that could not be built", () => {
  it("is inconclusive, because the deployed contract may be one of them", () => {
    expect(negativeVerdict({ complete: true, anyCompiled: true, guessed: [], partial: true })).toBe("inconclusive");
    expect(negativeVerdict({ complete: true, anyCompiled: true, guessed: [], partial: false })).toBe("no_match");
  });
});
