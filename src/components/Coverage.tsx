"use client";

import { usePulse } from "./live";

/** How much of the chain has proven source. Real counts only; absent until they are read. */
export function Coverage() {
  const { pulse } = usePulse();
  if (!pulse) return null;
  const { census } = pulse;
  const share = census.contracts ? Math.min(1, census.proven / census.contracts) : 0;
  const others = pulse.proofs - census.proven;
  const label = `${census.proven} proven of the ${census.contracts} contracts deployed directly on the EVM side`;
  return (
    <div>
      <svg viewBox="0 0 100 2" preserveAspectRatio="none" className="h-2 w-full" role="img" aria-label={label}>
        <title>{label}</title>
        <rect width="100" height="2" rx="1" fill="var(--rule)" />
        <rect className="meter-fill" width={Math.max(share * 100, 1)} height="2" rx="1" fill="var(--ok)" />
      </svg>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink">{census.proven.toLocaleString()}</span> proven of the{" "}
        <span className="font-medium text-ink">{census.contracts.toLocaleString()}</span> contracts deployed directly on
        the EVM side, counted at block {census.block.toLocaleString()}
        {others > 0 ? `, plus ${others.toLocaleString()} outside that count` : ""}.
      </p>
    </div>
  );
}
