import { keccak256 } from "viem";
import { getCode, vmKind } from "../../../lib/chain";
import type { ProofView, VmKind } from "../../../lib/types";

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/;
const COMMIT_RE = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/;

/** "owner/name" or https://github.com/owner/name(.git) -> "owner/name", else null. */
export function normaliseRepo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const url = URL_RE.exec(s);
  const repo = url ? `${url[1]}/${url[2]}` : s;
  if (!REPO_RE.test(repo)) return null;
  if (repo.split("/").some((p) => p === "." || p === ".." || p.endsWith(".git"))) return null;
  return repo;
}

export function normaliseCommit(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return COMMIT_RE.test(s) && !s.includes("..") ? s : null;
}

export function normaliseAddress(raw: unknown): `0x${string}` | null {
  return typeof raw === "string" && /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw.toLowerCase() as `0x${string}`) : null;
}

/** Re-reads live bytecode. `unknown` when the RPC fails; never `current` without a successful read. */
export async function liveStatus(
  address: string,
  runtimeHash: string,
): Promise<{ live: ProofView["live"]; vm: VmKind | null }> {
  try {
    const code = await getCode(address);
    return { live: keccak256(code) === runtimeHash ? "current" : "changed", vm: vmKind(code) };
  } catch {
    return { live: "unknown", vm: null };
  }
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The address the rate limit counts. The public front door names the visitor, and is believed
 * only when it also presents the shared secret, so nobody else can choose their own address.
 */
export function clientAddress(headers: Headers, secret = process.env.ONESCAN_PROXY_SECRET): string {
  const named = headers.get("x-onescan-client");
  if (secret && named && headers.get("x-onescan-proxy") === secret) return named;
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
