"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { shorten } from "./format";

export const btnPrimary =
  "btn-pop inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-base font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "btn-pop inline-flex min-h-11 items-center justify-center rounded-lg bg-surface px-4 text-base font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50";
export const inputCls =
  "min-h-11 w-full rounded-lg border border-ink/30 bg-surface px-3 text-base text-ink transition-shadow placeholder:text-muted";
export const linkCls = "text-accent underline hover:opacity-80";

function subscribe() {
  return () => {};
}
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-ink/30 px-3 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
      aria-label={`${label} ${shorten(value, 10, 6)}`}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : label}</span>
    </button>
  );
}

/** A hash or address: mono, truncated, full value on hover and in the copy button. */
export function Hash({
  value,
  head = 10,
  tail = 8,
  full = false,
  copy = true,
}: {
  value: string;
  head?: number;
  tail?: number;
  full?: boolean;
  copy?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 align-middle">
      <code
        title={value}
        className={`font-mono text-sm ${full ? "break-all" : "truncate"} min-w-0`}
      >
        {full ? value : shorten(value, head, tail)}
      </code>
      {copy && <CopyButton value={value} />}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-rule py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10">
      <h2 className="font-serif text-2xl font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type Tone = "ok" | "warn" | "bad" | "neutral";
const toneCls: Record<Tone, string> = {
  ok: "border-ok bg-ok-bg text-ink",
  warn: "border-warn bg-warn-bg text-ink",
  bad: "border-bad bg-bad-bg text-ink",
  neutral: "border-rule bg-surface text-ink",
};
export function Notice({
  tone = "neutral",
  title,
  children,
  role,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={`border-l-4 px-4 py-3 ${toneCls[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="flex items-center gap-3 py-10 text-muted">
      <span className="pulse inline-block size-2 rounded-full bg-accent" aria-hidden="true" />
      {what}
    </p>
  );
}

export function ErrorBlock({
  title,
  children,
  onRetry,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="py-6">
      <Notice tone="bad" title={title} role="alert">
        {children}
      </Notice>
      <div className="mt-4 flex flex-wrap gap-3">
        {onRetry && (
          <button type="button" onClick={onRetry} className={btnSecondary}>
            Try again
          </button>
        )}
        <Link href="/check" className={btnSecondary}>
          Start a new check
        </Link>
      </div>
    </div>
  );
}

export function Seal({ size = 26, className, draw = false }: { size?: number; className?: string; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true" className={className}>
      <circle cx="13" cy="13" r="11.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="1" />
      <path
        d="M8.8 13.3l3 3 5.4-6"
        pathLength={1}
        className={draw ? "seal-check" : undefined}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type StampTone = "ok" | "warn" | "bad" | "neutral";
const stampCls: Record<StampTone, string> = {
  ok: "block-sage",
  warn: "block-sand",
  bad: "block-clay",
  neutral: "block-paper",
};

/** The verdict. The hero of the product. */
const BURST = [
  ["-46px", "-30px", "120deg", "#c9c6ff"],
  ["-10px", "-44px", "-80deg", "#a9dcc6"],
  ["34px", "-34px", "160deg", "#efedf9"],
  ["50px", "6px", "90deg", "#c9c6ff"],
  ["26px", "36px", "200deg", "#a9dcc6"],
  ["-30px", "32px", "-140deg", "#efedf9"],
];

/** Thrown once from a stamp when a real match lands. */
export function StampBurst() {
  return (
    <span className="burst" aria-hidden="true">
      {BURST.map(([x, y, r, c]) => (
        <i key={x + y} style={{ "--x": x, "--y": y, "--r": r, "--c": c } as CSSProperties} />
      ))}
    </span>
  );
}

export function Stamp({
  tone,
  kicker,
  title,
  children,
}: {
  tone: StampTone;
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`stamp flex items-start justify-between gap-6 ${stampCls[tone]}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{kicker}</p>
        <h1 className="mt-1 font-serif text-4xl font-medium leading-tight sm:text-5xl sm:tracking-tight">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-base text-ink">{children}</div>}
      </div>
      {tone === "ok" && (
        <span className="relative hidden shrink-0 sm:block">
          <Seal size={72} draw />
          <StampBurst />
        </span>
      )}
    </div>
  );
}
