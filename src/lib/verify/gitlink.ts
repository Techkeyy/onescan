import { validateRepo } from "./github";

/** sha of a submodule from a GitHub contents API reply, or null. Only real gitlinks count. */
export function parseGitlink(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const isLink = o.type === "submodule" || typeof o.submodule_git_url === "string";
  const sha = typeof o.sha === "string" ? o.sha : "";
  return isLink && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

const pinCache = new Map<string, string>();

/**
 * The commit a repo pins a submodule at. `path` is relative to the repo root. Never throws:
 * on any failure (rate limit, network, not a gitlink) it returns a note, so callers must treat the
 * submodule as guessed (read at HEAD).
 */
export async function readGitlink(repo: string, path: string, commit: string): Promise<{ sha: string } | { note: string }> {
  const v = validateRepo(repo);
  if (!v) return { note: "invalid repo" };
  if (!/^[0-9a-f]{40}$/.test(commit)) return { note: "invalid commit" };
  const segs = path.split("/");
  if (segs.some((s) => !/^[A-Za-z0-9._@+-]+$/.test(s) || s === "." || s === "..")) return { note: "unsafe submodule path" };
  const key = `${repo}|${commit}|${path}`;
  const hit = pinCache.get(key);
  if (hit) return { sha: hit };
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "onescan-verify" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${v.owner}/${v.name}/contents/${segs.join("/")}?ref=${commit}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 403 || res.status === 429) return { note: "GitHub API rate limit (set GITHUB_TOKEN to raise it)" };
    if (!res.ok) return { note: `GitHub API HTTP ${res.status}` };
    const sha = parseGitlink(await res.json());
    if (!sha) return { note: "not a readable gitlink" };
    pinCache.set(key, sha);
    return { sha };
  } catch (e) {
    return { note: `GitHub API unreachable (${(e as Error).message})` };
  }
}
