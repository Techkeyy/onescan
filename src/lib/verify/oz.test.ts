// Real repo that imports OpenZeppelin (npm @openzeppelin/contracts, version from package-lock.json).
// Rohitamalraj/DotProof: hardhat project in contracts/, optimizer runs 1, evm paris.
import { describe, expect, it } from "vitest";
import { verify } from "./index";

const REPO = "Rohitamalraj/DotProof";
const HEAD_OK = {
  AgentRegistry: "0x95cced224908a20d7b4a7d684cbc9acd4b0e2177",
  Backstop: "0xb57969ce443dbdf2f41e67408a77e5311b548187",
  Gateway: "0x619ca0f74bbe92cae32ca72920cba0ff0e5af370",
} as const;
// Deployed from the commit that recorded the deployment (b08ea24), before later contract changes.
const DEPLOY_COMMIT = "b08ea2478a31feb6ece931984d39ce6918f4a028";
const AT_DEPLOY_COMMIT = {
  LendingMarket: "0x7e3444c1f9dbd53dea5ebc8160522b154857566b",
  CircuitBreaker: "0xfa5dc13b034a66a206e06ccd5e6f9e0aaee9cbe4",
} as const;

const show = async (name: string, a: `0x${string}`, commit?: string) => {
  const t = Date.now();
  const r = await verify({ repo: REPO, address: a, commit }, () => {});
  console.log(`OZ ${name} ${a} @${r.commit.slice(0, 10)} -> ${r.match ? r.match.kind + " " + r.match.file + ":" + r.match.contract : r.failure?.reason + " | " + r.failure?.detail} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return r;
};

describe("OpenZeppelin repo, default branch", () => {
  for (const [name, a] of Object.entries(HEAD_OK)) {
    it(`${name} matches at HEAD`, async () => {
      const r = await show(name, a as `0x${string}`);
      expect(r.match?.kind).toBe("exact");
      expect(r.match?.settings).toMatchObject({ optimizer: { enabled: true, runs: 1 }, evmVersion: "paris" });
    }, 700_000);
  }
});

describe("OpenZeppelin repo, pinned to the deployment commit", () => {
  for (const [name, a] of Object.entries(AT_DEPLOY_COMMIT)) {
    it(`${name} matches at ${DEPLOY_COMMIT.slice(0, 7)}`, async () => {
      const r = await show(name, a as `0x${string}`, DEPLOY_COMMIT);
      expect(r.match?.kind).toBe("exact");
    }, 700_000);
  }
  it("LendingMarket with NO commit given matches through the deployment-commit fallback", async () => {
    const stages: string[] = [];
    const t = Date.now();
    const r = await verify({ repo: REPO, address: AT_DEPLOY_COMMIT.LendingMarket }, (s) => stages.push(`${s.id}:${s.state}:${s.detail ?? ""}`));
    console.log(`OZ fallback LendingMarket -> ${r.match ? r.match.kind + " commit " + r.commit.slice(0, 10) + " deploymentCommitOf " + r.match.deploymentCommitOf : r.failure?.reason + " | " + r.failure?.detail} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    expect(r.match?.kind).toBe("exact");
    expect(r.match?.deploymentCommitOf).toBe("HEAD");
    expect(r.commit).not.toMatch(/^83c5d54de3/);
    expect(stages.some((x) => /Deployment commit/.test(x))).toBe(true);
  }, 900_000);
});
