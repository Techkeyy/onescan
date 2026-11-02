// Live: contracts whose deployed code carries NO compiler metadata (8 of 43 real team contracts).
// Each case logs its honest result; only the safety properties are asserted per case.
import { describe, expect, it } from "vitest";
import type { Stage } from "../types";
import { verify } from "./index";

const T = 900_000;
const cases: { repo: string; address: `0x${string}`; name: string }[] = [
  { repo: "Anshv784/potdrive", address: "0xdd3e268957ebeccfcca61b5676e31e620160d027", name: "PotDriveRegistry" },
  { repo: "lazydevpro/reachpot", address: "0xcfcdb8ccac9b95534aedbbe9c90e49a6a1d493cf", name: "reachpot" },
  { repo: "itsjusttu/potkit-portaldot", address: "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7", name: "PotKit" },
  { repo: "jonathan-moore58/bridge-zero", address: "0xa02EE16EB03d2cf1aeF199F7658FB8c8E3188ffd", name: "vault" },
  { repo: "MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman", address: "0x60481DFcFCA34A8F095939D9675eC715127B2e44", name: "Makhzan" },
  { repo: "MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman", address: "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA", name: "StorageGate" },
  { repo: "longbds0108/PortaldotL", address: "0x6e79287f62B47307B5b7349072c51AdAF8833d54", name: "BlindBidMarket" },
  { repo: "edycutjong/portaldot-hackathon-2026-forklift-edycu", address: "0x52f0edd92af9ff410ca63ccc83735552e1b2abc7", name: "Fork Receipt v2" },
];

describe("no-metadata contracts against their own repos", () => {
  for (const c of cases) {
    it(`${c.name} (${c.repo})`, async () => {
      const stages: Stage[] = [];
      const t = Date.now();
      const r = await verify({ repo: c.repo, address: c.address }, (s) => stages.push(s));
      const m = r.match;
      console.log(
        `NOMETA ${c.name} ${c.address} -> ${
          m
            ? `MATCH ${m.kind} ${m.file}:${m.contract} solc ${m.settings.version} opt ${JSON.stringify(m.settings.optimizer)} viaIR ${m.settings.viaIR} evm ${m.settings.evmVersion} commit ${r.commit.slice(0, 10)} deploymentCommitOf ${m.deploymentCommitOf}`
            : `${r.failure?.reason} | ${r.failure?.detail}`
        } (${((Date.now() - t) / 1000).toFixed(1)}s)`,
      );
      // Safety properties: never a negative verdict for unknown-compiler code; a match is only ever "code".
      expect(r.failure?.reason).not.toBe("no_match");
      if (m) expect(m.kind).toBe("code");
      if (r.failure) expect(["no_compiler_metadata", "no_code", "repo_not_found", "repo_too_large", "no_solidity", "compile_failed", "unavailable"]).toContain(r.failure.reason);
      expect(stages.some((s) => /No compiler version stored in the code/.test(s.detail ?? ""))).toBe(true);
    }, T);
  }
});

describe("FALSE CLAIMS with no-metadata code", () => {
  it("a no-metadata contract checked against another team's repo never matches and is not no_match", async () => {
    const t = Date.now();
    const r = await verify({ repo: "Anshv784/potdrive", address: "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7" }, () => {});
    console.log(`NOMETA FALSE potkit address vs potdrive repo -> ${r.match ? "MATCH(!!)" : `${r.failure?.reason} | ${r.failure?.detail}`} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    expect(r.match).toBeNull();
    expect(r.failure?.reason).toBe("no_compiler_metadata");
    expect(r.failure?.detail).toMatch(/not a verdict against the repo/i);
  }, T);

  it("a no-metadata contract checked against a metadata-era repo (nodescope) never matches", async () => {
    const r = await verify({ repo: "Firzadf/nodescope", address: "0xdd3e268957ebeccfcca61b5676e31e620160d027" }, () => {});
    console.log(`NOMETA FALSE potdrive address vs nodescope repo -> ${r.match ? "MATCH(!!)" : `${r.failure?.reason} | ${r.failure?.detail}`}`);
    expect(r.match).toBeNull();
    expect(r.failure?.reason).toBe("no_compiler_metadata");
  }, T);
});
