"use client";

import Link from "next/link";
import type { Proof } from "@/lib/types";
import { useApi } from "./api";
import { formatDate, shorten } from "./format";
import { ErrorBlock, Loading, btnPrimary } from "./ui";

type Row = Omit<Proof, "match"> & { match: Omit<Proof["match"], "source" | "abi"> };

export function ProofsList() {
  const { loading, result, reload } = useApi<Row[]>("/api/proofs");

  if (loading) return <Loading what="Loading proofs" />;
  if (!result) return null;
  if (!result.ok) {
    return (
      <ErrorBlock title="Could not load the proofs" onRetry={reload}>
        <p>{result.status === 0 ? "OneScan could not be reached." : result.error}</p>
      </ErrorBlock>
    );
  }
  if (result.data.length === 0) {
    return (
      <div className="py-4">
        <p className="max-w-xl">
          No proofs yet. A proof appears here only after a repo is checked and really matches its contract.
        </p>
        <Link href="/check" className={`${btnPrimary} mt-4`}>
          Check a repo
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {result.data.map((p) => (
        <li key={p.address}>
          <Link
            href={`/proof/${p.address}`}
            className="grid gap-1 py-4 text-ink no-underline hover:bg-ink/5 sm:grid-cols-[1fr_auto] sm:gap-x-6"
          >
            <span className="min-w-0">
              <span className="block break-words font-medium text-accent underline">{p.repo}</span>
              <span className="block font-mono text-sm text-muted" title={p.address}>
                {shorten(p.address, 12, 8)}
              </span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-4 text-sm text-muted sm:justify-end">
              <span className="font-semibold text-ok">{p.match.kind === "exact" ? "Exact match" : "Code matches"}</span>
              <span>{p.match.contract}</span>
              <span className="font-mono">{p.commit.slice(0, 7)}</span>
              <span>{formatDate(p.checkedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
