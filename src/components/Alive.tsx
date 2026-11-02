"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { apiGet } from "./api";
import { shorten } from "./format";
import { usePulse } from "./live";
import { StampBurst } from "./ui";

// Everything here moves on real data: proofs from the database, counts from the pulse. Nothing is invented.

type ProofRow = {
  address: `0x${string}`;
  repo: string;
  commit: string;
  runtimeHash: string;
  match: { kind: "exact" | "code"; contract: string };
  attestation?: { state: string; txHash: string | null };
};

function subscribeMotion(cb: () => void) {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

let proofsOnce: Promise<ProofRow[]> | null = null;
function useProofs() {
  const [rows, setRows] = useState<ProofRow[] | null>(null);
  useEffect(() => {
    let live = true;
    proofsOnce ??= apiGet<ProofRow[]>("/api/proofs").then((r) => {
      if (r.ok) return r.data;
      proofsOnce = null;
      return [];
    });
    proofsOnce.then((d) => {
      if (live) setRows(d);
    });
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

const recorded = (p: ProofRow) => p.attestation?.state === "confirmed";

const HEX = "0123456789abcdef";
const STEP_MS = 60;
const HASH_STEPS = 34;
const HOLD_STEPS = 90;

/** Real proofs from the ledger, one at a time: the real code hash resolves, then the verdict lands. */
export function ProofMachine() {
  const proofs = useProofs();
  const reduced = useReducedMotion();
  const [{ index, step }, setPos] = useState({ index: 0, step: 0 });
  const queue = (proofs ?? []).slice().sort((a, b) => Number(recorded(b)) - Number(recorded(a)));
  const count = queue.length;

  useEffect(() => {
    if (count === 0 || reduced) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setPos((p) => (p.step >= HASH_STEPS + HOLD_STEPS ? { index: (p.index + 1) % count, step: 0 } : { ...p, step: p.step + 1 }));
    }, STEP_MS);
    return () => clearInterval(t);
  }, [count, reduced]);

  const p = queue[index % Math.max(count, 1)];
  const shown = reduced ? HASH_STEPS : step;
  const done = shown >= HASH_STEPS;
  const hash = p?.runtimeHash ?? "";
  const known = Math.floor((shown / HASH_STEPS) * hash.length);

  return (
    <div className="print p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-medium">From the proof ledger</h2>
        <span className="chip bg-accent text-accent-ink">Real proofs, replayed</span>
      </div>
      {!p ? (
        <p role="status" className="py-16 text-muted">
          {proofs ? "The ledger is empty for now." : "Opening the ledger"}
        </p>
      ) : (
        <div className="mt-4">
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-muted">Repo</dt>
              <dd key={p.address} className="machine-in truncate text-lg font-medium">
                <Link href={`/proof/${p.address}`} className="underline decoration-accent decoration-1">
                  {p.repo}
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-sm text-muted">Contract</dt>
                <dd className="truncate">{p.match.contract}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Commit</dt>
                <dd className="font-mono text-sm leading-6">{p.commit.slice(0, 12)}</dd>
              </div>
            </div>
            <div>
              <dt className="text-sm text-muted">Code running on the chain, by hash</dt>
              <dd className="mt-1 break-all font-mono text-sm leading-6" aria-label={hash}>
                {Array.from(hash, (c, i) =>
                  i < known ? (
                    <span key={i} className="text-ok">
                      {c}
                    </span>
                  ) : (
                    <span key={i} className="text-muted" aria-hidden="true">
                      {i < known + 10 ? HEX[(i * 7 + shown * 5) % 16] : "."}
                    </span>
                  ),
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex min-h-16 flex-wrap items-center gap-3">
            {done ? (
              <>
                <span key={p.address} className="machine-stamp relative inline-flex block-sage items-center rounded-md border border-ink/25 px-3 py-2 font-serif text-2xl font-medium">
                  {p.match.kind === "exact" ? "Exact match" : "Code matches"}
                  {!reduced && <StampBurst />}
                </span>
                {recorded(p) && <span className="chip machine-in block-lilac">Recorded on Portaldot</span>}
              </>
            ) : (
              <span className="text-muted">Reading the hash</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TickerRow({ proofs, hidden }: { proofs: ProofRow[]; hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {Array.from({ length: Math.ceil(14 / proofs.length) }, () => proofs)
        .flat()
        .map((p, i) => (
          <li key={`${p.address}-${i}`} className="flex items-center whitespace-nowrap px-5">
            <Link href={`/proof/${p.address}`} tabIndex={hidden ? -1 : undefined} className="font-medium no-underline hover:underline">
              {p.repo}
            </Link>
            <span className="ml-2 font-mono text-sm text-muted">{shorten(p.address, 6, 4)}</span>
            <span aria-hidden="true" className="ml-5 inline-block size-1.5 rotate-45 bg-accent" />
          </li>
        ))}
    </ul>
  );
}

/** The real proofs, moving past. The list is doubled so the loop has no seam; the copy is hidden from readers. */
export function ProofTicker() {
  const proofs = useProofs();
  if (!proofs || proofs.length === 0) return <div className="h-12 border-y border-rule bg-surface" />;
  return (
    <div className="ticker overflow-hidden border-y border-rule bg-surface py-3" aria-label="Contracts OneScan has proven">
      <div className="ticker-track flex w-max">
        <TickerRow proofs={proofs} />
        <TickerRow proofs={proofs} hidden />
      </div>
    </div>
  );
}

/** Counts up from zero the first time it scrolls into view, then follows the real number. */
export function Count({ value, className = "" }: { value: number | null; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || value === null || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const q = Math.min(1, (t - t0) / 1100);
      setProgress(1 - Math.pow(1 - q, 3));
      if (q < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, value === null, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = value === null ? "..." : reduced ? value : Math.round(value * progress);
  return (
    <span ref={ref} className={className}>
      {typeof shown === "number" ? shown.toLocaleString() : shown}
    </span>
  );
}

export function LiveNumbers() {
  const { pulse } = usePulse();
  const stats: { n: number | null; label: string; tone: string }[] = [
    { n: pulse?.proofs ?? null, label: "contracts proven against their repo", tone: "block-sage" },
    { n: pulse?.onchain ?? null, label: "records written on Portaldot V3", tone: "block-lilac" },
    { n: pulse?.census.contracts ?? null, label: "contracts counted on the EVM side", tone: "block-paper" },
  ];
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
      {stats.map((s, i) => (
        <li key={s.label} className={`${s.tone} print pop-in p-5`} style={{ "--i": i, "--print-shadow": "#00000040" } as CSSProperties}>
          <Count value={s.n} className="block font-serif text-6xl font-medium leading-none" />
          <span className="mt-3 block font-medium">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Leans toward the pointer. Pointer position goes straight to CSS, so the page does not re-render. */
export function Tilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--rx", `${(((e.clientY - r.top) / r.height - 0.5) * -2.5).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width - 0.5) * 2.5).toFixed(2)}deg`);
  }
  function leave() {
    ref.current?.style.removeProperty("--rx");
    ref.current?.style.removeProperty("--ry");
  }
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
