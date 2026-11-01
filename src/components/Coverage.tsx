"use client";

import { usePulse } from "./live";

// From a full read-only scan of the EVM side: successful contract-creation transactions.
// Contracts made by other contracts are not counted.
const CENSUS = { contracts: 132, block: 283_513 };

/** How much of the chain has proven source. Real counts only; absent until they are read. */
export function Coverage() {
  const { pulse } = usePulse();
  if (!pulse) return null;
  return (
    <p className="text-sm text-muted">
      <span className="font-medium text-ink">{pulse.proofs.toLocaleString()}</span> proven of the{" "}
      <span className="font-medium text-ink">{CENSUS.contracts.toLocaleString()}</span> contracts deployed directly on
      the EVM side, counted at block {CENSUS.block.toLocaleString()}.
    </p>
  );
}
