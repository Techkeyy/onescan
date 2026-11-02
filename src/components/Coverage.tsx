"use client";

import { usePulse } from "./live";

// From a full read-only scan of the EVM side: successful contract-creation transactions.
// Contracts made by other contracts are not counted.
const CENSUS = { contracts: 132, block: 283_513 };

/** How much of the chain has proven source. Real counts only; absent until they are read. */
export function Coverage() {
  const { pulse } = usePulse();
  if (!pulse) return null;
  const share = Math.min(1, pulse.proofs / CENSUS.contracts);
  const label = `${pulse.proofs} proven of the ${CENSUS.contracts} contracts deployed directly on the EVM side`;
  return (
    <div>
      <svg viewBox="0 0 100 2" preserveAspectRatio="none" className="h-2 w-full" role="img" aria-label={label}>
        <title>{label}</title>
        <rect width="100" height="2" rx="1" fill="var(--rule)" />
        <rect className="meter-fill" width={Math.max(share * 100, 1)} height="2" rx="1" fill="var(--ok)" />
      </svg>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-ink">{pulse.proofs.toLocaleString()}</span> proven of the{" "}
        <span className="font-medium text-ink">{CENSUS.contracts.toLocaleString()}</span> contracts deployed directly on
        the EVM side, counted at block {CENSUS.block.toLocaleString()}.
      </p>
    </div>
  );
}
