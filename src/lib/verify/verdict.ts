export type NegativeInput = {
  /** Every settings combination was compiled and compared (no timeout, budget not exhausted). */
  complete: boolean;
  /** At least one contract compiled. */
  anyCompiled: boolean;
  /** Why some dependency used is not known to be the repo's pinned version (empty = all pinned). */
  guessed: string[];
  /** Some source files never compiled or had missing imports, so the deployed contract may be one of them. */
  partial?: boolean;
};

/**
 * What a failed comparison may be called. no_match is earned only when the search was complete AND every
 * dependency used was the one the repo pinned; otherwise the honest answer is inconclusive.
 */
export function negativeVerdict(i: NegativeInput): "no_match" | "inconclusive" | "compile_failed" {
  if (!i.complete) return "inconclusive";
  if (!i.anyCompiled) return "compile_failed";
  if (i.guessed.length > 0 || i.partial) return "inconclusive";
  return "no_match";
}

export function guessNote(guessed: string[]): string {
  const shown = guessed.slice(0, 3).join("; ");
  return `${guessed.length} dependency version(s) are not known to be the ones the repo pinned (${shown}${guessed.length > 3 ? "; ..." : ""}).`;
}
