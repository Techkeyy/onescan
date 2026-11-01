// SQLite persistence (node:sqlite). Server-only. Survives restarts.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Attestation, Creation, Job, Proof } from "./types";

export type Store = ReturnType<typeof openStore>;

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

export function openStore(dir: string = dataDir()) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "onescan.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_key_state ON jobs (key, state);
    CREATE TABLE IF NOT EXISTS proofs (
      address TEXT PRIMARY KEY,
      checked_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS creations (
      address TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);

  const parse = <T>(row: unknown): T | null => (row ? (JSON.parse((row as { data: string }).data) as T) : null);

  return {
    close: () => db.close(),

    insertJob(job: Job, key: string) {
      db.prepare("INSERT INTO jobs (id, key, state, created_at, data) VALUES (?, ?, ?, ?, ?)").run(
        job.id,
        key,
        job.state,
        job.createdAt,
        JSON.stringify(job),
      );
    },
    saveJob(job: Job) {
      db.prepare("UPDATE jobs SET state = ?, data = ? WHERE id = ?").run(job.state, JSON.stringify(job), job.id);
    },
    getJob: (id: string) => parse<Job>(db.prepare("SELECT data FROM jobs WHERE id = ?").get(id)),
    findActiveJob: (key: string) =>
      parse<Job>(
        db
          .prepare("SELECT data FROM jobs WHERE key = ? AND state IN ('queued','running') ORDER BY created_at LIMIT 1")
          .get(key),
      ),
    countQueued: () =>
      (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'queued'").get() as { n: number }).n,
    listQueued: () =>
      (db.prepare("SELECT data FROM jobs WHERE state = 'queued' ORDER BY created_at, rowid").all() as { data: string }[]).map(
        (r) => JSON.parse(r.data) as Job,
      ),
    /** Jobs left 'running' by a previous process. Returns them so the caller can fail them truthfully. */
    listRunning: () =>
      (db.prepare("SELECT data FROM jobs WHERE state = 'running'").all() as { data: string }[]).map(
        (r) => JSON.parse(r.data) as Job,
      ),

    getProof: (address: string) => parse<Proof>(db.prepare("SELECT data FROM proofs WHERE address = ?").get(address.toLowerCase())),
    /** Only ever called with a real match. Replaces an older proof for the same address. */
    putProof(p: Proof) {
      db.prepare(
        "INSERT INTO proofs (address, checked_at, data) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET checked_at = excluded.checked_at, data = excluded.data",
      ).run(p.address.toLowerCase(), p.checkedAt, JSON.stringify(p));
    },
    /** Updates the attestation only if the stored proof is still the one this attestation is for. */
    updateAttestation(address: string, runtimeHash: string, attestation: Attestation): boolean {
      const p = this.getProof(address);
      if (!p || p.runtimeHash !== runtimeHash) return false;
      p.attestation = attestation;
      db.prepare("UPDATE proofs SET data = ? WHERE address = ?").run(JSON.stringify(p), address.toLowerCase());
      return true;
    },
    listProofs: () =>
      (db.prepare("SELECT data FROM proofs ORDER BY checked_at DESC").all() as { data: string }[]).map(
        (r) => JSON.parse(r.data) as Proof,
      ),

    getCreation: (address: string) =>
      parse<Creation>(db.prepare("SELECT data FROM creations WHERE address = ?").get(address.toLowerCase())),
    putCreation(address: string, c: Creation) {
      db.prepare("INSERT OR REPLACE INTO creations (address, data) VALUES (?, ?)").run(address.toLowerCase(), JSON.stringify(c));
    },
  };
}

const g = globalThis as unknown as { __onescanStore?: Store };
export function getStore(): Store {
  return (g.__onescanStore ??= openStore());
}
