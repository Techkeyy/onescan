import { describe, expect, it } from "vitest";
import { candidateVersions, cleanSolcVersion, parseFoundryToml, parseHardhatConfig } from "./config";
import { compareWhole } from "./metadata";
import { satisfiesPragma } from "./pragma";

describe("no-metadata support: config and version candidates", () => {
  it("reads pinned compiler and cbor settings from foundry.toml and hardhat config as text", () => {
    const f = parseFoundryToml(`[profile.default]\nsolc_version = "0.8.19"\ncbor_metadata = false\nbytecode_hash = "none"\n`);
    expect(f).toMatchObject({ solcVersion: "0.8.19", cborMetadata: false, bytecodeHash: "none" });
    expect(parseFoundryToml(`[profile.default]\nsolc = "v0.8.20"\n`).solcVersion).toBe("0.8.20");
    expect(parseFoundryToml(`[profile.default]\nsolc = "/usr/bin/solc"\n`).solcVersion).toBeUndefined();
    expect(parseFoundryToml(`[profile.ci]\nsolc = "0.8.1"\n`).solcVersion).toBeUndefined();
    expect(parseHardhatConfig(`module.exports = { solidity: "0.8.24" }`).solcVersion).toBe("0.8.24");
    expect(
      parseHardhatConfig(`module.exports = { solidity: { compilers: [{ version: "0.8.21", settings: { metadata: { bytecodeHash: "none", appendCBOR: false } } }] } }`),
    ).toMatchObject({ solcVersion: "0.8.21", cborMetadata: false, bytecodeHash: "none" });
    expect(cleanSolcVersion("^0.8.0")).toBeUndefined();
  });

  const releases = ["0.8.30", "0.8.28", "0.8.26", "0.8.24", "0.8.20", "0.8.19", "0.8.0", "0.7.6"];
  const pick = (configVersion: string | null, rootPragmas: string[][]) =>
    candidateVersions({ configVersion, rootPragmas, releases, satisfies: satisfiesPragma });

  it("orders: pinned, exact pragma, highest allowed, then common versions the pragma allows; max 4, deduped", () => {
    expect(pick("0.8.19", [["^0.8.0"]]).map((p) => p.version)).toEqual(["0.8.19", "0.8.30", "0.8.24", "0.8.20"]);
    expect(pick(null, [["0.8.20"]]).map((p) => p.version)).toEqual(["0.8.20"]);
    expect(pick(null, [["^0.8.20"]])).toEqual([
      { version: "0.8.30", why: "highest release the pragma allows" },
      { version: "0.8.24", why: "common version the pragma allows" },
      { version: "0.8.20", why: "common version the pragma allows" },
      { version: "0.8.28", why: "common version the pragma allows" },
    ]);
    expect(pick(null, [[">=0.7.0 <0.8.0"]]).map((p) => p.version)).toEqual(["0.7.6"]);
    expect(pick("0.8.30", [["^0.8.0"]]).map((p) => p.version)[0]).toBe("0.8.30");
    expect(pick("0.8.99", [["^0.8.20"]]).map((p) => p.version)[0]).toBe("0.8.30");
    expect(pick(null, [["^0.4.0"]])).toEqual([]);
  });

  it("an exact pragma is tried before the highest allowed release, which then serves the majority of files", () => {
    const r = pick(null, [["^0.8.20"], ["^0.8.20"], ["0.7.6"]]).map((p) => p.version);
    expect(r.slice(0, 2)).toEqual(["0.7.6", "0.8.30"]);
  });
});

describe("compareWhole (code stored without metadata)", () => {
  const body = "6080604052" + "7f" + "11".repeat(32) + "5b00";
  const cborTail = "a264697066735822" + "1220" + "ab".repeat(32) + "64736f6c63430008180033";
  it("requires equal length and bytes", () => {
    expect(compareWhole({ object: body, immutableRefs: [], linkRefs: [] }, "0x" + body, false)).toBe(true);
    expect(compareWhole({ object: body + "00", immutableRefs: [], linkRefs: [] }, "0x" + body, false)).toBe(false);
    expect(compareWhole({ object: body.replace("5b00", "5b01"), immutableRefs: [], linkRefs: [] }, "0x" + body, false)).toBe(false);
  });
  it("a compiled CBOR tail is only dropped when asked, and then the code must still be equal", () => {
    const withTail = body + cborTail;
    expect(compareWhole({ object: withTail, immutableRefs: [], linkRefs: [] }, "0x" + body, false)).toBe(false);
    expect(compareWhole({ object: withTail, immutableRefs: [], linkRefs: [] }, "0x" + body, true)).toBe(true);
    expect(compareWhole({ object: body.replace("5b00", "5b01") + cborTail, immutableRefs: [], linkRefs: [] }, "0x" + body, true)).toBe(false);
  });
  it("masks immutables and library placeholders on both sides, and nothing else", () => {
    const chain = body.replace("11".repeat(32), "22".repeat(32));
    expect(compareWhole({ object: body, immutableRefs: [{ start: 6, length: 32 }], linkRefs: [] }, "0x" + chain, false)).toBe(true);
    expect(compareWhole({ object: body, immutableRefs: [{ start: 6, length: 16 }], linkRefs: [] }, "0x" + chain, false)).toBe(false);
    const ph = "6080" + "__$" + "a".repeat(34) + "$__" + "5b00";
    expect(compareWhole({ object: ph, immutableRefs: [], linkRefs: [{ start: 2, length: 20 }] }, "0x6080" + "ee".repeat(20) + "5b00", false)).toBe(true);
  });
});
