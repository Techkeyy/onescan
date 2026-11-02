import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Parser } from "tar";
import { VerifyFailure, VerifyUnavailableError } from "./errors";
import { fetchRetry } from "./net";

export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 300 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 20_000;

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Strict "owner/name". Anything else (URLs, extra slashes, dots-only names) is refused. */
export function validateRepo(repo: string): { owner: string; name: string } | null {
  if (typeof repo !== "string") return null;
  const parts = repo.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!OWNER.test(owner) || !NAME.test(name)) return null;
  if (name === "." || name === ".." || name.endsWith(".git")) return null;
  return { owner, name };
}

// ---------- git smart-HTTP advertisement (pkt-line) ----------

export type Pkt = { kind: "flush" | "delim" | "end" | "data"; text: string };

export function parsePktLines(buf: Uint8Array): Pkt[] {
  const out: Pkt[] = [];
  const b = Buffer.from(buf);
  let i = 0;
  while (i < b.length) {
    if (i + 4 > b.length) throw new Error("truncated pkt-line header");
    const hex = b.subarray(i, i + 4).toString("latin1");
    if (!/^[0-9a-f]{4}$/i.test(hex)) throw new Error("bad pkt-line length");
    const len = parseInt(hex, 16);
    if (len === 0) { out.push({ kind: "flush", text: "" }); i += 4; continue; }
    if (len === 1) { out.push({ kind: "delim", text: "" }); i += 4; continue; }
    if (len === 2) { out.push({ kind: "end", text: "" }); i += 4; continue; }
    if (len < 4 || i + len > b.length) throw new Error("bad pkt-line length");
    out.push({ kind: "data", text: b.subarray(i + 4, i + len).toString("utf8") });
    i += len;
  }
  return out;
}

export type AdvertisedRef = { sha: string; name: string };

export function parseAdvertisedRefs(pkts: Pkt[]): AdvertisedRef[] {
  const refs: AdvertisedRef[] = [];
  for (const p of pkts) {
    if (p.kind !== "data") continue;
    let line = p.text.replace(/\n$/, "");
    if (line.startsWith("#") || line.startsWith("version ")) continue;
    const nul = line.indexOf("\0");
    if (nul >= 0) line = line.slice(0, nul);
    const m = /^([0-9a-f]{40}) (.+)$/.exec(line);
    if (m) refs.push({ sha: m[1], name: m[2] });
  }
  return refs;
}

/** HEAD, a branch or a tag to a 40-char sha. Annotated tags resolve to the commit (peeled ^{}). null = not found. */
export function resolveRef(refs: AdvertisedRef[], ref: string | undefined): string | null {
  const byName = new Map(refs.map((r) => [r.name, r.sha]));
  const r = (ref ?? "").trim();
  if (!r || r === "HEAD") return byName.get("HEAD") ?? null;
  if (/^[0-9a-f]{40}$/i.test(r)) return r.toLowerCase();
  const candidates = r.startsWith("refs/")
    ? [`${r}^{}`, r]
    : [`refs/tags/${r}^{}`, `refs/tags/${r}`, `refs/heads/${r}`];
  for (const c of candidates) {
    const sha = byName.get(c);
    if (sha) return sha;
  }
  return null;
}

/**
 * Resolve to a full sha without the GitHub API (no rate limit).
 * Returns null only for a short hex sha, which is completed from the archive root folder name.
 */
export async function resolveCommit(repo: string, ref: string | undefined): Promise<string | null> {
  const v = validateRepo(repo);
  if (!v) throw new VerifyFailure("repo_not_found", `"${repo}" is not a valid owner/name`);
  const r = (ref ?? "").trim();
  if (/^[0-9a-f]{40}$/i.test(r)) return r.toLowerCase();
  if (r && (r.includes("..") || !/^[A-Za-z0-9._\/@+-]{1,200}$/.test(r))) {
    throw new VerifyFailure("repo_not_found", `"${r}" is not a valid branch, tag or commit`);
  }
  const url = `https://github.com/${v.owner}/${v.name}.git/info/refs?service=git-upload-pack`;
  const res = await fetchRetry("github", url, { headers: { "user-agent": "onescan-verify" } });
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new VerifyFailure("repo_not_found", `Repository ${repo} was not found or is not public.`);
  }
  if (!res.ok) throw new VerifyUnavailableError("github", `HTTP ${res.status} reading refs of ${repo}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let refs: AdvertisedRef[];
  try {
    refs = parseAdvertisedRefs(parsePktLines(buf));
  } catch (e) {
    throw new VerifyUnavailableError("github", `unreadable ref advertisement: ${(e as Error).message}`);
  }
  const sha = resolveRef(refs, r || undefined);
  if (sha) return sha;
  if (/^[0-9a-f]{4,39}$/i.test(r)) return null;
  if (!r && refs.length === 0) throw new VerifyFailure("repo_not_found", `Repository ${repo} has no commits.`);
  throw new VerifyFailure("repo_not_found", `"${r || "HEAD"}" was not found in ${repo}.`);
}

// ---------- archive download and extraction ----------

/** Path inside the archive without its root folder, or null if unsafe/empty. */
export function safeEntryPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.includes("\0") || raw.includes("\\")) return null;
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return null;
  const segs = raw.split("/").filter((s) => s !== "");
  if (segs.some((s) => s === "..")) return null;
  const rest = segs.slice(1).filter((s) => s !== ".");
  if (rest.length === 0) return null;
  return rest.join("/");
}

const WANTED_NAMES = new Set(["package.json", "package-lock.json", "remappings.txt", ".gitmodules"]);
const HARDHAT_CONFIG = /^hardhat\.config\.(js|cjs|mjs|ts)$/;

/** Files worth extracting. node_modules is never read. */
export function isWantedPath(rel: string): boolean {
  const segs = rel.split("/");
  if (segs.includes("node_modules") || segs.includes(".git")) return false;
  const base = segs[segs.length - 1];
  return base.endsWith(".sol") || base.endsWith(".yul") || base.endsWith(".toml") || WANTED_NAMES.has(base) || HARDHAT_CONFIG.test(base);
}

export type Extracted = {
  /** Full commit sha from the archive root folder ("<repo>-<sha>"), when present. */
  rootSha: string | null;
  files: string[]; // repo-relative paths written under dir
  skippedLarge: string[];
};

const ALLOWED_HOSTS = new Set(["codeload.github.com", "github.com"]);

/** Download the codeload tar.gz for a validated repo and sha, extract wanted files into dir (caller removes dir). */
export async function fetchRepoFiles(repo: string, sha: string, dir: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<Extracted> {
  const v = validateRepo(repo);
  if (!v) throw new VerifyFailure("repo_not_found", `"${repo}" is not a valid owner/name`);
  if (!/^[0-9a-fA-F]{4,40}$/.test(sha)) throw new VerifyFailure("repo_not_found", `"${sha}" is not a commit`);
  const url = `https://codeload.github.com/${v.owner}/${v.name}/tar.gz/${sha}`;
  const res = await fetchRetry("github", url, { headers: { "user-agent": "onescan-verify" } }, { timeoutMs: 90_000 });
  if (res.status === 404) throw new VerifyFailure("repo_not_found", `Commit ${sha.slice(0, 12)} was not found in ${repo}.`);
  if (!res.ok || !res.body) throw new VerifyUnavailableError("github", `HTTP ${res.status} downloading ${repo}`);
  if (!ALLOWED_HOSTS.has(new URL(res.url || url).hostname)) {
    throw new VerifyUnavailableError("github", "archive redirected to an unexpected host");
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body.cancel().catch(() => {});
    throw new VerifyFailure("repo_too_large", `Archive is ${(declared / 1048576).toFixed(0)} MB; the limit is ${maxBytes / 1048576} MB.`);
  }

  const base = resolve(dir);
  const files: string[] = [];
  const skippedLarge: string[] = [];
  const writes: Promise<void>[] = [];
  let rootName: string | null = null;
  let unpacked = 0;
  const state: { failure: Error | null } = { failure: null };
  const fail = (e: Error) => { state.failure = state.failure ?? e; };

  const parser = new Parser({
    onReadEntry: (entry) => {
      const raw = entry.path;
      if (rootName === null) rootName = raw.split("/").filter(Boolean)[0] ?? "";
      unpacked += entry.size ?? 0;
      if (unpacked > MAX_UNPACKED_BYTES) {
        fail(new VerifyFailure("repo_too_large", "Archive expands beyond the size limit."));
        entry.resume();
        return;
      }
      const rel = safeEntryPath(raw);
      if (entry.type !== "File" || !rel || !isWantedPath(rel) || files.length >= MAX_FILES) { entry.resume(); return; }
      if ((entry.size ?? 0) > MAX_FILE_BYTES) { skippedLarge.push(rel); entry.resume(); return; }
      const target = resolve(join(base, ...rel.split("/")));
      if (target !== base && !target.startsWith(base + sep)) { entry.resume(); return; }
      const chunks: Buffer[] = [];
      entry.on("data", (c: Buffer) => chunks.push(c));
      entry.on("end", () => {
        files.push(rel);
        writes.push(mkdir(dirname(target), { recursive: true }).then(() => writeFile(target, Buffer.concat(chunks))));
      });
    },
  });
  parser.on("error", (e: Error) => fail(e));
  const finished = new Promise<void>((r) => { parser.on("end", () => r()); parser.on("close", () => r()); });

  const reader = res.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new VerifyFailure("repo_too_large", `Archive is larger than ${maxBytes / 1048576} MB.`);
      }
      if (state.failure) break;
      parser.write(Buffer.from(value));
    }
    parser.end();
    await finished;
    await Promise.all(writes);
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  if (state.failure) {
    if (state.failure instanceof VerifyFailure) throw state.failure;
    throw new VerifyUnavailableError("github", `archive could not be read: ${state.failure.message}`);
  }
  const m = rootName ? /-([0-9a-f]{40})$/.exec(rootName) : null;
  return { rootSha: m ? m[1] : null, files, skippedLarge };
}
