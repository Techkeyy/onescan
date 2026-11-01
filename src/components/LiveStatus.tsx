"use client";

import { usePulse } from "./live";

/** The chain's real height. Goes quiet and says so when it cannot be read. */
export function LiveStatus({ className = "" }: { className?: string }) {
  const { pulse, failed } = usePulse();
  if (!pulse) return <span className={`text-sm text-muted ${className}`}>Reading the chain</span>;
  if (failed || pulse.block === null) {
    return (
      <span role="status" className={`text-sm text-warn ${className}`}>
        Chain not reachable right now
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-sm text-muted ${className}`}>
      <span className="pulse inline-block size-2 rounded-full bg-ok" aria-hidden="true" />
      <span>
        Portaldot V3 block{" "}
        <span key={pulse.block} className="tick font-mono text-ink">
          {pulse.block.toLocaleString()}
        </span>
      </span>
    </span>
  );
}
