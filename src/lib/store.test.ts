import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openStore } from "./store";
import type { Job } from "./types";
import { proofFixture } from "./testfixtures";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "onescan-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("store", () => {
  it("persists jobs, proofs and creations across reopening", () => {
    const dir = tmp();
    const a = openStore(dir);
    const job: Job = {
      id: "j1",
      input: { repo: "a/b", address: "0xd48da7eff3264bdd51a86b873da9ff6997aae99c" },
      state: "queued",
      stages: [],
      failure: null,
      createdAt: 1,
      updatedAt: 1,
    };
    a.insertJob(job, "k");
    a.putProof(proofFixture());
    a.putCreation("0xD48DA7EFF3264BDD51A86B873DA9FF6997AAE99C", {
      block: 5,
      txHash: "0x" + "ab".repeat(32) as `0x${string}`,
      deployer: "0x" + "cd".repeat(20) as `0x${string}`,
      timestamp: 9,
    });
    a.close();

    const b = openStore(dir);
    expect(b.getJob("j1")).toEqual(job);
    expect(b.getProof("0xd48da7eff3264bdd51a86b873da9ff6997aae99c")?.repo).toBe("a/b");
    expect(b.getCreation("0xd48da7eff3264bdd51a86b873da9ff6997aae99c")?.block).toBe(5);
    expect(b.listProofs()).toHaveLength(1);
    b.close();
  });

  it("updateAttestation ignores a proof that has since been replaced", () => {
    const s = openStore(tmp());
    s.putProof(proofFixture());
    const att = { state: "confirmed" as const, registry: null, txHash: null, error: null };
    expect(s.updateAttestation(proofFixture().address, "0x" + "99".repeat(32), att)).toBe(false);
    expect(s.updateAttestation(proofFixture().address, proofFixture().runtimeHash, att)).toBe(true);
    expect(s.getProof(proofFixture().address)?.attestation.state).toBe("confirmed");
    s.close();
  });
});
