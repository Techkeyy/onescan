"use client";

import { usePulse } from "./live";

const SLOTS = 28;
const W = 8;
const GAP = 2;

/** One mark for each block actually seen while this page is open. Nothing here is simulated. */
export function BlockStrip() {
  const { history } = usePulse();
  const blocks = history.slice(-SLOTS);
  const label = `${history.length} ${history.length === 1 ? "block" : "blocks"} seen since you opened this page`;
  return (
    <div>
      <svg viewBox={`0 0 ${SLOTS * (W + GAP) - GAP} 16`} className="w-full" role="img" aria-label={label}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const block = blocks[i];
          const newest = block !== undefined && i === blocks.length - 1;
          return (
            <rect
              key={block ?? `empty-${i}`}
              x={i * (W + GAP)}
              width={W}
              height="16"
              rx="2"
              fill={block === undefined ? "var(--rule)" : newest ? "var(--accent)" : "var(--ok)"}
              opacity={block === undefined ? 0.5 : 1}
              className={newest ? "tick-mark" : undefined}
            >
              {block !== undefined && <title>Block {block.toLocaleString()}</title>}
            </rect>
          );
        })}
      </svg>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
