// Simple in-memory fixed-window counter per IP: 10 per 10 minutes.
const WINDOW_MS = 10 * 60_000;
const LIMIT = 10;
const g = globalThis as unknown as { __onescanRl?: Map<string, { n: number; reset: number }> };
const hits = (g.__onescanRl ??= new Map());

/** Returns seconds to wait when over the limit, else 0. */
export function rateLimit(ip: string, now = Date.now()): number {
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const e = hits.get(ip);
  if (!e || e.reset <= now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return 0;
  }
  if (e.n >= LIMIT) return Math.ceil((e.reset - now) / 1000);
  e.n++;
  return 0;
}
