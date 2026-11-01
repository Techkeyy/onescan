/** Decimal base-unit string to a display string, using BigInt only. */
export function formatUnits(raw: string, decimals: number, maxFrac = 6): { short: string; full: string } {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  const v = BigInt(digits || "0");
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0");
  const fullFrac = frac.replace(/0+$/, "");
  const shortFrac = frac.slice(0, maxFrac).replace(/0+$/, "");
  const sign = neg && v !== BigInt(0) ? "-" : "";
  const group = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return {
    short: `${sign}${group(whole)}${shortFrac ? "." + shortFrac : ""}`,
    full: `${sign}${group(whole)}${fullFrac ? "." + fullFrac : ""}`,
  };
}

/** "12.5" to base units. Returns null when not a plain decimal or too precise. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(w) * BigInt(10) ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

export function shorten(value: string, head = 8, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Chain timestamps may be seconds, job timestamps milliseconds. */
export function toDate(n: number): Date {
  return new Date(n < 1e12 ? n * 1000 : n);
}

export function formatDate(n: number): string {
  return toDate(n).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const ADDRESS_0X = /^0x[0-9a-fA-F]{40}$/;
export const ADDRESS_SS58 = /^[1-9A-HJ-NP-Za-km-z]{46,48}$/;
export const REPO_INPUT = /^(?:https?:\/\/(?:www\.)?github\.com\/)?[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;

export function githubCommitUrl(repo: string, commit: string) {
  return `https://github.com/${repo}/commit/${commit}`;
}
export function githubFileUrl(repo: string, commit: string, file: string) {
  return `https://github.com/${repo}/blob/${commit}/${file.split("/").map(encodeURIComponent).join("/")}`;
}
