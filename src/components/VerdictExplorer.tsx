"use client";

import { useState } from "react";

const CELLS = 44;
const META = 6; // the fingerprint the compiler stores at the end of the code

type Verdict = {
  title: string;
  tone: string;
  body: string;
  /** What the lower row shows for a given byte index. */
  cell: (i: number) => "same" | "diff" | "meta-diff" | "unread";
  note: string;
};

const VERDICTS: Verdict[] = [
  {
    title: "Exact match",
    tone: "text-ok",
    body: "The running code and the repo are identical, right down to the fingerprint the compiler embeds.",
    cell: () => "same",
    note: "Every byte is equal, including the fingerprint at the end.",
  },
  {
    title: "Code matches",
    tone: "text-ok",
    body: "The running code is the same. Only the embedded fingerprint differs, usually a comment or a file path.",
    cell: (i) => (i >= CELLS - META ? "meta-diff" : "same"),
    note: "All the code is equal. Only the fingerprint at the end differs.",
  },
  {
    title: "Does not match",
    tone: "text-ink",
    body: "The repo compiled under every setting OneScan tries, and none of them reproduced the running code.",
    cell: (i) => ((i * 7) % 5 < 3 ? "diff" : "same"),
    note: "The code itself differs, so this is not what is running.",
  },
  {
    title: "Could not finish",
    tone: "text-warn",
    body: "Time ran out or a service was down. No comparison was completed, so this is never treated as a failure of the repo.",
    cell: (i) => (i < 16 ? "same" : "unread"),
    note: "The rest was never compared, so OneScan does not give a verdict.",
  },
];

const W = 10;
const GAP = 2;
const width = CELLS * (W + GAP) - GAP;
// Stable texture so a row reads as bytes rather than a solid bar.
const shade = (i: number) => 0.35 + (((i * 37) % 11) / 11) * 0.4;

/** The bars are an illustration of the comparison. Choosing a verdict shows what it means. */
export function VerdictExplorer() {
  const [index, setIndex] = useState(0);
  const v = VERDICTS[index];
  return (
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1" role="group" aria-label="Choose a verdict">
        {VERDICTS.map((x, i) => (
          <button
            key={x.title}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            onMouseEnter={() => setIndex(i)}
            className={`min-h-11 rounded border-2 px-3 py-2 text-center font-serif text-lg font-medium transition-colors ${
              i === index ? `border-current ${x.tone} bg-ink/5` : "border-rule text-muted hover:text-ink"
            }`}
          >
            {x.title}
          </button>
        ))}
      </div>

      <figure aria-live="polite">
        <figcaption className="text-lg">{v.body}</figcaption>
        <div className="mt-5 space-y-3">
          <div>
            <p className="mb-1 text-sm text-muted">Rebuilt from the repo</p>
            <svg viewBox={`0 0 ${width} 24`} className="w-full" aria-hidden="true">
              {Array.from({ length: CELLS }, (_, i) => (
                <rect key={i} x={i * (W + GAP)} width={W} height="24" rx="2" fill="var(--ink)" opacity={shade(i)} />
              ))}
            </svg>
          </div>
          <div>
            <p className="mb-1 text-sm text-muted">Running on the chain</p>
            <svg viewBox={`0 0 ${width} 24`} className="w-full" aria-hidden="true">
              {Array.from({ length: CELLS }, (_, i) => {
                const s = v.cell(i);
                const fill =
                  s === "same" ? "var(--ink)" : s === "diff" ? "var(--bad)" : s === "meta-diff" ? "var(--warn)" : "transparent";
                return (
                  <rect
                    key={i}
                    x={i * (W + GAP) + 0.5}
                    y="0.5"
                    width={W - 1}
                    height="23"
                    rx="2"
                    fill={fill}
                    stroke={s === "unread" ? "var(--rule)" : "none"}
                    opacity={s === "same" ? shade(i) : 1}
                    className="flow-shape"
                  />
                );
              })}
            </svg>
          </div>
        </div>
        <p className="mt-3 font-medium">{v.note}</p>
        <p className="mt-1 text-sm text-muted">Illustration of the comparison, not a real contract.</p>
      </figure>
    </div>
  );
}
