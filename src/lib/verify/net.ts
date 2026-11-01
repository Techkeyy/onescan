import { VerifyUnavailableError } from "./errors";

type Service = "rpc" | "github" | "solc" | "npm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout and retries on network errors / 5xx. Returns the final Response (any status < 500). */
export async function fetchRetry(
  service: Service,
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; tries?: number } = {},
): Promise<Response> {
  const tries = opts.tries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status < 500 && res.status !== 429) return res;
      last = `HTTP ${res.status} from ${new URL(url).host}`;
      await res.body?.cancel().catch(() => {});
    } catch (e) {
      last = `${(e as Error).name}: ${(e as Error).message} (${new URL(url).host})`;
    }
    if (i < tries - 1) await sleep(400 * (i + 1));
  }
  throw new VerifyUnavailableError(service, last);
}

/** Text of a 200 response, null for 404 (definitive), throws Unavailable for anything else. */
export async function fetchTextOrNull(service: Service, url: string, maxBytes = 5_000_000): Promise<string | null> {
  const res = await fetchRetry(service, url);
  if (res.status === 404) return null;
  if (!res.ok) throw new VerifyUnavailableError(service, `HTTP ${res.status} for ${new URL(url).host}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return null;
  return buf.toString("utf8");
}

export async function rpcCall<T = unknown>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetchRetry(
    "rpc",
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    },
    { timeoutMs: 20_000 },
  );
  if (!res.ok) throw new VerifyUnavailableError("rpc", `HTTP ${res.status}`);
  let json: { result?: T; error?: { message?: string } };
  try {
    json = await res.json();
  } catch {
    throw new VerifyUnavailableError("rpc", "response was not JSON");
  }
  if (json.error) throw new VerifyUnavailableError("rpc", `${method}: ${json.error.message ?? "error"}`);
  return json.result as T;
}
