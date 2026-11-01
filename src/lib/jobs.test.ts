import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJobs, MAX_QUEUED, QueueFullError } from "./jobs";
import { openStore } from "./store";
import type { Attestation, VerifyInput, VerifyResult } from "./types";
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

const ADDR = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c" as const;
const input = (over: Partial<VerifyInput> = {}): VerifyInput => ({ repo: "a/b", address: ADDR, ...over });

// Test-only stubs for the engine and attester, which other builders own.
const matchResult = (i: VerifyInput): VerifyResult => {
  const p = proofFixture();
  return {
    repo: i.repo,
    commit: p.commit,
    address: i.address,
    runtimeHash: p.runtimeHash,
    sourceHash: p.sourceHash,
    compilerVersion: "0.8.20",
    match: p.match,
    failure: null,
  };
};
const noMatchResult = (i: VerifyInput): VerifyResult => ({
  ...matchResult(i),
  sourceHash: null,
  match: null,
  failure: { reason: "no_match", detail: "nothing matched" },
});
const okAttest = async (_p: unknown, onUpdate: (a: Attestation) => void): Promise<Attestation> => {
  onUpdate({ state: "submitted", registry: null, txHash: null, error: null });
  return { state: "confirmed", registry: ("0x" + "ee".repeat(20)) as `0x${string}`, txHash: null, error: null };
};

describe("jobs", () => {
  it("dedupes identical input while queued or running, and enforces the queue cap", async () => {
    const store = openStore(tmp());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const jobs = createJobs({
      store,
      verify: async (i) => {
        await gate;
        return noMatchResult(i);
      },
      attest: okAttest,
    });
    const first = jobs.submit(input());
    expect(jobs.submit(input())).toBe(first); // running
    const queued = jobs.submit(input({ repo: "c/d" }));
    expect(jobs.submit(input({ repo: "c/d" }))).toBe(queued); // queued
    expect(queued).not.toBe(first);
    for (let n = 0; n < MAX_QUEUED - 1; n++) jobs.submit(input({ repo: `x/r${n}` }));
    expect(() => jobs.submit(input({ repo: "x/overflow" }))).toThrow(QueueFullError);
    release();
    await jobs.idle();
    expect(jobs.get(first)?.state).toBe("no_match");
    // once finished the same input is a new job
    expect(jobs.submit(input())).not.toBe(first);
    await jobs.idle();
    store.close();
  });

  it("restart marks running jobs failed, truthfully, and does not rerun them", async () => {
    const dir = tmp();
    const s1 = openStore(dir);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const j1 = createJobs({ store: s1, verify: async (i) => (await gate, noMatchResult(i)), attest: okAttest });
    const id = j1.submit(input());
    expect(j1.get(id)?.state).toBe("running");
    // Simulate a crash: the DB is left with a running job and the process dies.
    const s2 = openStore(dir);
    let calls = 0;
    const j2 = createJobs({ store: s2, verify: async (i) => (calls++, noMatchResult(i)), attest: okAttest });
    await j2.idle();
    const job = j2.get(id)!;
    expect(job.state).toBe("failed");
    expect(job.failure?.detail).toMatch(/restarted/);
    expect(calls).toBe(0);
    release();
    await new Promise((r) => setTimeout(r, 20));
    s1.close();
    s2.close();
  });

  it("a failed or negative check keeps the existing proof; a match saves and attests it", async () => {
    const store = openStore(tmp());
    store.putProof(proofFixture({ repo: "old/repo", checkedAt: 5 }));
    let mode: "no_match" | "throw" | "match" = "no_match";
    const jobs = createJobs({
      store,
      verify: async (i) => {
        if (mode === "throw") throw new Error("boom");
        return mode === "match" ? matchResult(i) : noMatchResult(i);
      },
      attest: okAttest,
    });
    const a = jobs.submit(input());
    await jobs.idle();
    expect(jobs.get(a)?.state).toBe("no_match");
    expect(store.getProof(ADDR)?.repo).toBe("old/repo");

    mode = "throw";
    const b = jobs.submit(input());
    await jobs.idle();
    expect(jobs.get(b)?.state).toBe("failed");
    expect(store.getProof(ADDR)?.repo).toBe("old/repo");

    mode = "match";
    const c = jobs.submit(input());
    await jobs.idle();
    expect(jobs.get(c)?.state).toBe("matched");
    const p = store.getProof(ADDR)!;
    expect(p.repo).toBe("a/b");
    expect(p.attestation.state).toBe("confirmed");
    store.close();
  });

  it("an attest failure keeps the proof", async () => {
    const store = openStore(tmp());
    const jobs = createJobs({
      store,
      verify: async (i) => matchResult(i),
      attest: async () => {
        throw new Error("no gas");
      },
    });
    const id = jobs.submit(input());
    await jobs.idle();
    expect(jobs.get(id)?.state).toBe("matched");
    const p = store.getProof(ADDR)!;
    expect(p.repo).toBe("a/b");
    expect(p.attestation).toMatchObject({ state: "failed", error: "no gas" });
    store.close();
  });
});
