"use client";

import { useEffect, useState } from "react";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; retryAfter?: number };

function errorText(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return `The server answered ${status}.`;
}

/** status 0 means the request never reached the server. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { signal, cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: body as T };
    return { ok: false, status: res.status, error: errorText(body, res.status) };
  } catch {
    return { ok: false, status: 0, error: "Could not reach OneScan." };
  }
}

export async function apiPostCheck(body: {
  repo: string;
  address: string;
  commit?: string;
}): Promise<ApiResult<{ id: string }>> {
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: json as { id: string } };
    const ra = Number(res.headers.get("retry-after"));
    return {
      ok: false,
      status: res.status,
      error: errorText(json, res.status),
      ...(Number.isFinite(ra) && ra > 0 ? { retryAfter: ra } : {}),
    };
  } catch {
    return { ok: false, status: 0, error: "Could not reach OneScan." };
  }
}

/** Plain message for a failed POST /api/check. Input stays in the form. */
export function startFailureMessage(r: { status: number; error: string; retryAfter?: number }): string {
  if (r.status === 429) {
    return r.retryAfter
      ? `OneScan is busy with other checks. Your input is kept. Try again in about ${r.retryAfter} seconds.`
      : "OneScan is busy with other checks. Your input is kept. Try again in a minute.";
  }
  if (r.status === 0) return "Could not reach OneScan. Your input is kept, so check your connection and try again.";
  return r.error;
}

/** Fetch once per path; `reload` fetches again and returns to the loading state. */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = `${path}#${nonce}`;
  const [res, setRes] = useState<{ key: string; path: string; r: ApiResult<T>; good: ApiResult<T> | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    const ac = new AbortController();
    apiGet<T>(path, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      setRes((prev) => ({ key, path, r, good: r.ok ? r : prev?.path === path ? prev.good : null }));
    });
    return () => ac.abort();
  }, [path, key]);

  const loading = !!path && res?.key !== key;
  return {
    loading,
    result: loading ? null : (res?.r ?? null),
    /** The last successful answer for this same path, kept while a reload runs or after one fails. */
    lastGood: res?.path === path ? res.good : null,
    reload: () => setNonce((n) => n + 1),
  };
}
