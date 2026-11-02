import type { NextRequest } from "next/server";
import { getJobs, QueueFullError } from "@/lib/jobs";
import { json, normaliseAddress, normaliseCommit, normaliseRepo } from "../_lib/util";
import { rateLimit } from "../_lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const wait = rateLimit(ip);
  if (wait > 0) {
    return Response.json(
      { error: "Too many checks from this address. Try again later." },
      { status: 429, headers: { "retry-after": String(wait), "cache-control": "no-store" } },
    );
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "That request is too large." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    body = b as Record<string, unknown>;
  } catch {
    return json({ error: "Send a JSON body: { repo, address, commit? }." }, 400);
  }

  const repo = normaliseRepo(body.repo);
  if (!repo) return json({ error: "repo must be owner/name or https://github.com/owner/name." }, 400);
  const address = normaliseAddress(body.address);
  if (!address) return json({ error: "address must be 0x followed by 40 hex characters." }, 400);
  const commit = normaliseCommit(body.commit);
  if (commit === null) return json({ error: "commit must be a sha, tag or branch name." }, 400);

  try {
    const id = getJobs().submit({ repo, address, ...(commit ? { commit } : {}) });
    return json({ id }, 201);
  } catch (e) {
    if (e instanceof QueueFullError) return json({ error: e.message }, 429);
    return json({ error: "Could not start the check." }, 500);
  }
}
