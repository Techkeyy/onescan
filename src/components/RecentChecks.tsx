"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Job } from "@/lib/types";
import { useApi } from "./api";
import { shorten } from "./format";

// A per-browser convenience only. It can come back empty and nothing depends on it.
const KEY = "onescan.recent";
type Recent = { id: string; repo: string; address: string };

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function rememberCheck(entry: Recent) {
  try {
    const list = (JSON.parse(read()) as Recent[]).filter((r) => r.id !== entry.id);
    localStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, 5)));
  } catch {
    // Private windows may refuse storage. The check itself is unaffected.
  }
}

const noSub = () => () => {};

const WORD: Record<Job["state"], { text: string; cls: string }> = {
  queued: { text: "Waiting", cls: "text-muted" },
  running: { text: "Running", cls: "text-accent" },
  matched: { text: "Matched", cls: "text-ok" },
  no_match: { text: "No match", cls: "text-ink" },
  failed: { text: "Did not finish", cls: "text-warn" },
};

function Row({ r }: { r: Recent }) {
  const { result } = useApi<Job>(`/api/check/${encodeURIComponent(r.id)}`);
  const state = result?.ok ? result.data.state : null;
  const href = state === "matched" ? `/proof/${r.address}` : `/check/${r.id}`;
  return (
    <li>
      <Link
        href={href}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-ink no-underline transition-colors hover:bg-ink/5"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{r.repo}</span>
          <span className="block truncate font-mono text-sm text-muted">{shorten(r.address, 6, 4)}</span>
        </span>
        <span className={`text-sm font-medium ${state ? WORD[state].cls : "text-muted"}`}>
          {state ? WORD[state].text : result ? "Expired" : ""}
        </span>
      </Link>
    </li>
  );
}

export function RecentChecks() {
  const raw = useSyncExternalStore(noSub, read, () => "[]");
  let list: Recent[] = [];
  try {
    list = JSON.parse(raw) as Recent[];
  } catch {
    list = [];
  }
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="border border-rule bg-surface">
      <h2 id="recent-title" className="border-b border-rule px-4 py-3 font-serif text-xl font-medium">
        Your recent checks
      </h2>
      <ul className="divide-y divide-rule px-4">
        {list.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}
