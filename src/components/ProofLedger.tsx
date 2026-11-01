"use client";

import Link from "next/link";
import { useState } from "react";
import { shorten } from "./format";
import { timeAgo, useNow, usePulse } from "./live";
import { Seal } from "./ui";

/** Real proofs, newest first. A row presses in only when a new proof actually lands. */
export function ProofLedger({ limit = 6 }: { limit?: number }) {
  const { pulse, failed } = usePulse();
  const now = useNow(30_000);
  const rows = (pulse?.latest ?? []).slice(0, limit);
  const [openedAt] = useState(() => Date.now());

  if (!pulse) {
    return (
      <p role="status" className="py-8 text-muted">
        {failed ? "The ledger could not be read just now." : "Opening the ledger"}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="py-8 text-muted">
        The ledger is empty. A row appears here only when a repo really matches its contract.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-rule">
      {rows.map((p) => (
        <li key={p.address} className={p.checkedAt > openedAt ? "ledger-row" : undefined}>
          <Link
            href={`/proof/${p.address}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3 text-ink no-underline transition-colors hover:bg-ink/5"
          >
            <Seal size={24} className="text-ok" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.repo}</span>
              <span className="block truncate text-sm text-muted">
                {p.contract} <span className="font-mono">{shorten(p.address, 6, 4)}</span>
              </span>
            </span>
            <span className="text-right text-sm">
              <span className="block font-medium text-ok">{p.kind === "exact" ? "Exact match" : "Code matches"}</span>
              <span className="block text-muted" suppressHydrationWarning>
                {timeAgo(p.checkedAt, now)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
