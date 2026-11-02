"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Pulse } from "@/lib/types";
import { apiGet } from "./api";

const EVERY_MS = 6000;

// One poll for the whole page, however many components read it. Paused while the tab is hidden.
type Live = { pulse: Pulse | null; failed: boolean; history: number[] };
let current: Live = { pulse: null, failed: false, history: [] };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

async function tick() {
  clearTimeout(timer);
  if (listeners.size === 0) return;
  if (!document.hidden) {
    const r = await apiGet<Pulse>("/api/pulse");
    if (r.ok) {
      const block = r.data.block;
      const seen = block !== null && block !== current.history.at(-1);
      current = { pulse: r.data, failed: false, history: seen ? [...current.history, block].slice(-200) : current.history };
    } else {
      current = { ...current, failed: true };
    }
    listeners.forEach((l) => l());
  }
  if (listeners.size > 0) timer = setTimeout(tick, EVERY_MS);
}

function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) tick();
  const onVisible = () => {
    if (!document.hidden) tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    listeners.delete(listener);
    document.removeEventListener("visibilitychange", onVisible);
    if (listeners.size === 0) clearTimeout(timer);
  };
}

const EMPTY: Live = { pulse: null, failed: false, history: [] };
export function usePulse() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}

/** Re-renders on an interval so relative times and timers stay true. */
export function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function timeAgo(then: number, now: number): string {
  const ms = then < 1e12 ? then * 1000 : then;
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
