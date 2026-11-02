import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { VerifyFailure, VerifyUnavailableError } from "./errors";
import { fetchRetry } from "./net";

const BIN = "https://binaries.soliditylang.org/bin";

export function dataDir(override?: string): string {
  return override ?? process.env.ONESCAN_DATA_DIR ?? join(process.cwd(), "data");
}

type SolcList = {
  releases: Record<string, string>;
  builds: { path: string; version: string; sha256?: string }[];
};

const inflight = new Map<string, Promise<string>>();

async function loadList(dir: string, version: string | null): Promise<SolcList> {
  const file = join(dir, "list.json");
  try {
    const st = await stat(file);
    const list = JSON.parse(await readFile(file, "utf8")) as SolcList;
    if (version === null && list.releases && Date.now() - st.mtimeMs < 24 * 3600_000) return list;
    if (version !== null && list.releases?.[version] && Date.now() - st.mtimeMs < 24 * 3600_000) return list;
    if (version !== null && list.releases?.[version]) {
      // stale but sufficient: releases never change once published
      return list;
    }
  } catch { /* fall through to download */ }
  const res = await fetchRetry("solc", `${BIN}/list.json`);
  if (!res.ok) throw new VerifyUnavailableError("solc", `list.json HTTP ${res.status}`);
  const text = await res.text();
  const list = JSON.parse(text) as SolcList;
  await mkdir(dir, { recursive: true });
  await writeFile(file + ".tmp", text);
  await rename(file + ".tmp", file);
  return list;
}

/** All released solc versions (highest first), from the cached or downloaded list.json. */
export async function listReleases(override?: string): Promise<string[]> {
  const dir = join(dataDir(override), "solc");
  await mkdir(dir, { recursive: true });
  const list = await loadList(dir, null);
  const num = (v: string) => v.split(".").map(Number);
  return Object.keys(list.releases).filter((v) => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => {
    const x = num(a), y = num(b);
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  });
}

/** Path of the cached soljson for an exact release version, downloading and checking sha256 if needed. */
export function ensureSoljson(version: string, override?: string): Promise<string> {
  const dir = join(dataDir(override), "solc");
  const key = `${dir}|${version}`;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new VerifyFailure("compile_failed", `Unsupported compiler version "${version}".`);
      await mkdir(dir, { recursive: true });
      const list = await loadList(dir, version);
      const name = list.releases[version];
      if (!name || !/^soljson-v[0-9A-Za-z.+-]+\.js$/.test(name)) {
        throw new VerifyFailure("compile_failed", `Compiler solc ${version} is not published at binaries.soliditylang.org.`);
      }
      const file = join(dir, name);
      try { await stat(file); return file; } catch { /* download */ }
      const res = await fetchRetry("solc", `${BIN}/${name}`, {}, { timeoutMs: 120_000 });
      if (!res.ok) throw new VerifyUnavailableError("solc", `${name} HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const want = list.builds.find((b) => b.path === name)?.sha256?.replace(/^0x/, "");
      if (want && createHash("sha256").update(buf).digest("hex") !== want) {
        throw new VerifyUnavailableError("solc", `${name} failed its sha256 check`);
      }
      await writeFile(file + ".tmp", buf);
      await rename(file + ".tmp", file);
      return file;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Where the solc JS wrapper lives. Resolved at runtime from cwd so bundlers leave it alone. */
function wrapperPath(): string {
  const roots = [process.cwd(), process.argv[1] ? join(process.argv[1], "..") : process.cwd()];
  for (const r of roots) {
    try { return createRequire(join(r, "noop.js")).resolve("solc/wrapper"); } catch { /* try next */ }
  }
  throw new VerifyFailure("compile_failed", "The solc package is not installed next to the server (needs node_modules/solc).");
}

// Plain CommonJS source run by `new Worker(code, { eval: true })`: no file path to trace or bundle.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
let compiler;
try {
  const wrapper = require(workerData.wrapperPath);
  compiler = wrapper(require(workerData.soljsonPath));
  parentPort.postMessage({ ready: true });
} catch (e) {
  parentPort.postMessage({ fatal: String((e && e.stack) || e) });
}
parentPort.on("message", (m) => {
  try {
    parentPort.postMessage({ id: m.id, output: compiler.compile(m.input) });
  } catch (e) {
    parentPort.postMessage({ id: m.id, error: String((e && e.message) || e) });
  }
});
`;

export class CompileTimeout extends Error {
  constructor(ms: number) { super(`compile exceeded ${Math.round(ms / 1000)}s`); this.name = "CompileTimeout"; }
}

export type StandardOutput = {
  errors?: { severity: string; message: string; formattedMessage?: string }[];
  contracts?: Record<string, Record<string, {
    abi?: unknown[];
    evm?: { deployedBytecode?: {
      object?: string;
      immutableReferences?: Record<string, { start: number; length: number }[]>;
      linkReferences?: Record<string, Record<string, { start: number; length: number }[]>>;
    } };
  }>>;
};

/** One soljson in one worker thread. A timed-out compile kills the thread; the next compile starts a fresh one. */
export class SolcRunner {
  private worker: Worker | null = null;
  private ready: Promise<Worker> | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();

  constructor(private soljsonPath: string) {}

  private start(): Promise<Worker> {
    if (this.ready) return this.ready;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { wrapperPath: wrapperPath(), soljsonPath: this.soljsonPath },
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
    });
    this.worker = worker;
    const failAll = (e: Error) => {
      if (this.worker !== null && this.worker !== worker) return;
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
      this.worker = null;
      this.ready = null;
    };
    this.ready = new Promise<Worker>((resolve, reject) => {
      worker.on("message", (m: { ready?: boolean; fatal?: string; id?: number; output?: string; error?: string }) => {
        if (m.ready) return resolve(worker);
        if (m.fatal) { const e = new VerifyFailure("compile_failed", `Could not load the compiler: ${m.fatal.split("\n")[0]}`); reject(e); failAll(e); return; }
        const p = m.id !== undefined ? this.pending.get(m.id) : undefined;
        if (!p || m.id === undefined) return;
        this.pending.delete(m.id);
        if (m.error !== undefined) p.reject(new Error(m.error)); else p.resolve(m.output ?? "");
      });
      worker.on("error", (e) => { reject(e); failAll(e instanceof Error ? e : new Error(String(e))); });
      worker.on("exit", () => { const e = new Error("compiler thread exited"); reject(e); failAll(e); });
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  async compile(input: object, timeoutMs: number): Promise<StandardOutput> {
    const worker = await this.start();
    const id = ++this.seq;
    const text = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.close();
        reject(new CompileTimeout(timeoutMs));
      }, Math.max(1000, timeoutMs));
      this.pending.set(id, {
        resolve: (s) => { clearTimeout(timer); resolve(s); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      worker.postMessage({ id, input: JSON.stringify(input) });
    });
    return JSON.parse(text) as StandardOutput;
  }

  close(): void {
    const w = this.worker;
    this.worker = null;
    this.ready = null;
    if (w) void w.terminate();
  }
}
