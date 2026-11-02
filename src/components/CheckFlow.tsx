"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    title: "Reads the chain",
    body: "OneScan fetches the code running at the address and reads the compiler version stored inside it.",
    nodes: ["address", "running"],
    edges: ["a"],
  },
  {
    title: "Fetches the repo",
    body: "It pins your repo to one exact commit, so the answer can never drift with later pushes.",
    nodes: ["repo"],
    edges: [],
  },
  {
    title: "Rebuilds the code",
    body: "It compiles the repo with that same compiler, trying the repo's own settings first. Nothing from the repo is ever executed.",
    nodes: ["repo", "rebuilt", "running"],
    edges: ["b", "c"],
  },
  {
    title: "Compares byte for byte",
    body: "The rebuilt code is held against the running code. Anything weaker than an equal result is not a match.",
    nodes: ["running", "rebuilt", "compare", "verdict"],
    edges: ["d", "e", "f"],
  },
  {
    title: "Looks back if it must",
    body: "If the latest code fails, it retries the last commit from before deployment, because repos often move on.",
    nodes: ["compare", "repo"],
    edges: ["g"],
  },
] as const;

// Two columns, repo on the left and chain on the right, meeting at the comparison.
const EDGES: Record<string, string> = {
  a: "M420 60 V108",
  b: "M140 60 V108",
  c: "M308 140 H252",
  d: "M420 170 C420 196 350 198 324 218",
  e: "M140 170 C140 196 210 198 236 218",
  f: "M280 280 V308",
  g: "M168 250 C4 250 -6 40 28 30",
};

function Node({ id, x, y, w, label, on }: { id: string; x: number; y: number; w: number; label: string; on: Set<string> }) {
  const active = on.has(id);
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height="60"
        rx="8"
        fill={active ? "var(--accent)" : "var(--surface)"}
        stroke={active ? "var(--accent)" : "var(--rule)"}
        strokeWidth="2"
        className="flow-shape"
      />
      <text
        x={x + w / 2}
        y={y + 36}
        textAnchor="middle"
        fontSize="16"
        fontWeight="500"
        fill={active ? "var(--accent-ink)" : "var(--ink)"}
        className="flow-shape"
      >
        {label}
      </text>
    </g>
  );
}

/** The steps drive the diagram. It walks by itself only while on screen, and stops once someone chooses a step. */
export function CheckFlow() {
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        clearInterval(timer);
        if (entry.isIntersecting) timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 3200);
      },
      { threshold: 0.4 },
    );
    if (root.current) io.observe(root.current);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [held]);

  const on = new Set<string>(STEPS[step].nodes);
  const edges = new Set<string>(STEPS[step].edges);

  return (
    <div ref={root} className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-8 lg:grid-cols-2">
      <ol className="space-y-1">
        {STEPS.map((s, i) => {
          const active = i === step;
          return (
            <li key={s.title}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setHeld(true);
                  setStep(i);
                }}
                onMouseEnter={() => {
                  setHeld(true);
                  setStep(i);
                }}
                className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)] rounded-lg border-l-2 py-3 pl-3 pr-2 text-left transition-colors ${
                  active ? "border-accent bg-ink/5" : "border-transparent hover:bg-ink/5"
                }`}
              >
                <span className={`font-serif text-2xl ${active ? "text-accent" : "text-muted"}`} aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="mt-1 block max-w-lg text-muted">{s.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <figure className="lg:sticky lg:top-24">
        <svg
          viewBox="-10 0 570 372"
          className="w-full"
          role="img"
          aria-label={`Diagram of a check. Current step: ${STEPS[step].title}.`}
        >
          <defs>
            <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0l8 4-8 4z" fill="var(--accent)" />
            </marker>
            <marker id="flow-arrow-idle" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0l8 4-8 4z" fill="var(--rule)" />
            </marker>
          </defs>

          {Object.entries(EDGES).map(([id, d]) => (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={edges.has(id) ? "var(--accent)" : id === "g" ? "transparent" : "var(--rule)"}
              strokeWidth="2"
              strokeDasharray={id === "g" ? "6 6" : undefined}
              markerEnd={edges.has(id) ? "url(#flow-arrow)" : id === "g" ? undefined : "url(#flow-arrow-idle)"}
              className={edges.has(id) ? "flow-edge-on flow-shape" : "flow-shape"}
            />
          ))}

          <Node id="repo" x={30} y={0} w={220} label="Repo at a commit" on={on} />
          <Node id="address" x={310} y={0} w={220} label="Contract address" on={on} />
          <Node id="rebuilt" x={30} y={110} w={220} label="Rebuilt code" on={on} />
          <Node id="running" x={310} y={110} w={220} label="Running code" on={on} />
          <Node id="compare" x={170} y={220} w={220} label="Compare byte for byte" on={on} />
          <Node id="verdict" x={170} y={310} w={220} label="Verdict" on={on} />
        </svg>
        <figcaption className="mt-2 text-sm text-muted">
          Step {step + 1} of {STEPS.length}. Choose a step to see it.
        </figcaption>
      </figure>
    </div>
  );
}
