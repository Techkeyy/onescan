// Live: pinned submodules and the former no_match pairs. Each case logs its honest result.
import { describe, expect, it } from "vitest";
import type { Stage } from "../types";
import { verify } from "./index";

const T = 900_000;
const run = async (name: string, repo: string, address: `0x${string}`, commit?: string) => {
  const stages: Stage[] = [];
  const t = Date.now();
  const r = await verify({ repo, address, commit }, (s) => stages.push(s));
  const m = r.match;
  console.log(
    `PINS ${name} ${address} -> ${
      m
        ? `MATCH ${m.kind} ${m.file}:${m.contract} solc ${m.settings.version} opt ${JSON.stringify(m.settings.optimizer)} viaIR ${m.settings.viaIR} evm ${m.settings.evmVersion} commit ${r.commit.slice(0, 10)} deploymentCommitOf ${m.deploymentCommitOf}`
        : `${r.failure?.reason} | ${r.failure?.detail}`
    } (${((Date.now() - t) / 1000).toFixed(1)}s)`,
  );
  return { r, stages };
};

describe("pinned submodules", () => {
  it("lazydevpro/reachpot now matches (OpenZeppelin read at the pinned commit)", async () => {
    const { r } = await run("reachpot", "lazydevpro/reachpot", "0xcfcdb8ccac9b95534aedbbe9c90e49a6a1d493cf");
    expect(r.match?.kind).toBe("code");
    expect(r.match?.settings.version).toBe("0.8.28");
  }, T);
});

describe("ballast: deployed code is the pre-v2 ReserveOracle (v2 landed 2026-10-31, after the deployment)", () => {
  it("matches at the last commit before v2 (0ad8434)", async () => {
    const { r } = await run("ballast@0ad8434", "edycutjong/portaldot-hackathon-2026-ballast-edycu", "0x4832cdb7a89c0539fb2e762ab94fcdb5710a155e", "0ad843462ebc43338166453946b4dd929126c516");
    expect(r.match?.kind).toBeDefined();
  }, T);
});

describe("former no_match pairs (reported honestly; safety properties asserted)", () => {
  const pairs: [string, string, `0x${string}`][] = [
    ["plaque", "unifyWeb3/plaque", "0xa0e58d0c6392048959c0b16a9d3696fe49d063d6"],
    ["ballast", "edycutjong/portaldot-hackathon-2026-ballast-edycu", "0x4832cdb7a89c0539fb2e762ab94fcdb5710a155e"],
    ["ReviveCheck", "a252937166/ReviveCheck", "0xedaf8a25bb583ad164a94191b762414277198df9"],
    ["katalyst", "s70239176-ctrl/katalyst", "0x786DEF20A47b7B22c67eBaac3A9a3b3D5C0ddD46"],
  ];
  for (const [name, repo, addr] of pairs) {
    it(name, async () => {
      const { r } = await run(name, repo, addr);
      // never an unearned negative: no_match must come with nothing guessed
      if (r.failure?.reason === "no_match") expect(r.failure.detail).not.toMatch(/not known to be the ones the repo pinned/);
      if (r.match) expect(["exact", "code"]).toContain(r.match.kind);
    }, T);
  }
});
