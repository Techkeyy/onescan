import type { ReactNode } from "react";

/** The workspace surface: every page where the work happens. */
export function Work({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">{children}</div>;
}
