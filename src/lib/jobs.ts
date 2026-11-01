// Durable serial job queue. One verify at a time, state in SQLite. Server-only.
import { randomUUID } from "node:crypto";
import { getStore, type Store } from "./store";
import type { Attestation, Job, Proof, Stage, VerifyInput, VerifyResult, VerifyFailureReason } from "./types";

export const MAX_QUEUED = 50;

export class QueueFullError extends Error {
  constructor() {
    super("The check queue is full. Try again in a few minutes.");
  }
}

type VerifyFn = (input: VerifyInput, onStage: (s: Stage) => void) => Promise<VerifyResult>;
type AttestFn = (
  p: { address: `0x${string}`; runtimeHash: `0x${string}`; sourceHash: `0x${string}`; commit: string; repo: string },
  onUpdate: (a: Attestation) => void,
) => Promise<Attestation>;

export type JobDeps = { store: Store; verify: VerifyFn; attest: AttestFn };

const NO_ATTESTATION: Attestation = { state: "none", registry: null, txHash: null, error: null };

// The shared VerifyFailureReason has no value for these two; see the builder report.
const INTERRUPTED: VerifyFailureReason = "interrupted";
const INTERNAL: VerifyFailureReason = "internal_error";

export function jobKey(i: VerifyInput): string {
  return `${i.repo.toLowerCase()}|${i.commit ?? ""}|${i.address.toLowerCase()}`;
}

export function createJobs({ store, verify, attest }: JobDeps) {
  let busy = false;
  const attests = new Set<Promise<unknown>>();

  // Startup recovery: a job left running was interrupted. Say so; never resume or duplicate it.
  for (const j of store.listRunning()) {
    store.saveJob({
      ...j,
      state: "failed",
      failure: {
        reason: INTERRUPTED,
        detail: "The server restarted while this check was running, so it was stopped. Submit it again.",
      },
      updatedAt: Date.now(),
    });
  }

  function update(job: Job, patch: Partial<Job>): Job {
    Object.assign(job, patch, { updatedAt: Date.now() });
    store.saveJob(job);
    return job;
  }

  function runAttest(proof: Proof) {
    const persist = (a: Attestation) => {
      store.updateAttestation(proof.address, proof.runtimeHash, a);
    };
    const p = attest(
      {
        address: proof.address,
        runtimeHash: proof.runtimeHash,
        sourceHash: proof.sourceHash,
        commit: proof.commit,
        repo: proof.repo,
      },
      persist,
    )
      .then(persist)
      .catch((e) =>
        persist({ state: "failed", registry: null, txHash: null, error: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => attests.delete(p));
    attests.add(p);
  }

  async function run(job: Job) {
    update(job, { state: "running" });
    let result: VerifyResult;
    try {
      result = await verify(job.input, (s) => {
        const i = job.stages.findIndex((x) => x.id === s.id);
        const stages = [...job.stages];
        if (i >= 0) stages[i] = s;
        else stages.push(s);
        update(job, { stages });
      });
    } catch (e) {
      update(job, {
        state: "failed",
        failure: { reason: INTERNAL, detail: e instanceof Error ? e.message : String(e) },
      });
      return;
    }

    if (result.match && result.sourceHash) {
      const existing = store.getProof(result.address);
      const same =
        existing && existing.runtimeHash === result.runtimeHash && existing.sourceHash === result.sourceHash;
      const keepAttestation = same && existing.attestation.state === "confirmed";
      const proof: Proof = {
        address: result.address,
        repo: result.repo,
        commit: result.commit,
        match: result.match,
        runtimeHash: result.runtimeHash,
        sourceHash: result.sourceHash,
        attestation: keepAttestation ? existing.attestation : NO_ATTESTATION,
        checkedAt: Date.now(),
      };
      store.putProof(proof);
      update(job, { state: "matched", failure: null });
      if (!keepAttestation) runAttest(proof);
      return;
    }

    // A failed or negative check never touches stored proofs.
    const noMatch = result.failure?.reason === "no_match";
    update(job, {
      state: noMatch ? "no_match" : "failed",
      failure: result.failure ?? { reason: INTERNAL, detail: "The check ended without a result." },
    });
  }

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      for (let next = store.listQueued()[0]; next; next = store.listQueued()[0]) {
        try {
          await run(next);
        } catch (e) {
          update(next, {
            state: "failed",
            failure: { reason: INTERNAL, detail: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    } finally {
      busy = false;
    }
  }

  const api = {
    /** Returns the job id; the same input queued or running returns the existing id. */
    submit(input: VerifyInput): string {
      const key = jobKey(input);
      const active = store.findActiveJob(key);
      if (active) return active.id;
      if (store.countQueued() >= MAX_QUEUED) throw new QueueFullError();
      const now = Date.now();
      const job: Job = { id: randomUUID(), input, state: "queued", stages: [], failure: null, createdAt: now, updatedAt: now };
      store.insertJob(job, key);
      void pump();
      return job.id;
    },
    get: (id: string) => store.getJob(id),
    /** Resolves when the queue is empty and attestations have settled (used by tests). */
    async idle() {
      while (busy || attests.size > 0) {
        await Promise.allSettled([...attests]);
        await new Promise((r) => setTimeout(r, 10));
      }
    },
  };

  // Jobs still queued from a previous process continue.
  void pump();
  return api;
}

export type Jobs = ReturnType<typeof createJobs>;

const g = globalThis as unknown as { __onescanJobs?: Jobs };

/** The process-wide queue. Engine modules load lazily so importing this file stays cheap. */
export function getJobs(): Jobs {
  if (!g.__onescanJobs) {
    g.__onescanJobs = createJobs({
      store: getStore(),
      verify: async (i, s) => (await import("./verify")).verify(i, s),
      attest: async (p, u) => (await import("./attest")).attest(p, u),
    });
  }
  return g.__onescanJobs;
}
