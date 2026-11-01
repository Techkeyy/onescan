import { decode } from "cbor-x";

export type SplitCode = {
  /** Executable part, lowercase hex without 0x. */
  body: string;
  /** CBOR metadata plus its 2-byte length, lowercase hex. Empty when no valid metadata. */
  trailer: string;
  decoded: Record<string, unknown> | null;
};

const strip0x = (h: string) => (h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h).toLowerCase();

/** Split solc's trailing CBOR metadata off runtime bytecode. Never throws. */
export function splitMetadata(hex: string): SplitCode {
  const h = strip0x(hex);
  const none: SplitCode = { body: h, trailer: "", decoded: null };
  if (h.length < 6 || !/^[0-9a-f]*$/.test(h) || h.length % 2 !== 0) return none;
  const len = parseInt(h.slice(-4), 16);
  const total = (len + 2) * 2;
  if (len < 1 || total > h.length) return none;
  const metaHex = h.slice(h.length - total, h.length - 4);
  try {
    const value = decode(Buffer.from(metaHex, "hex")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array) return none;
    const decoded = value instanceof Map ? Object.fromEntries(value as Map<string, unknown>) : (value as Record<string, unknown>);
    if (Object.keys(decoded).length === 0) return none;
    return { body: h.slice(0, h.length - total), trailer: h.slice(h.length - total), decoded };
  } catch {
    return none;
  }
}

/** "0.8.28" from the metadata `solc` field (3 raw bytes, or a string for pre-releases). */
export function solcVersionFromMetadata(decoded: Record<string, unknown> | null): string | null {
  const v = decoded?.solc;
  if (v instanceof Uint8Array || Array.isArray(v)) {
    const a = Array.from(v as ArrayLike<number>);
    if (a.length === 3 && a.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) return a.join(".");
    return null;
  }
  if (typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)) return v;
  return null;
}

export type Range = { start: number; length: number };

/** Zero the given byte ranges of a hex string. Ranges beyond the string are clipped. */
export function maskRanges(hex: string, ranges: Range[]): string {
  if (ranges.length === 0) return hex;
  const chars = hex.split("");
  for (const r of ranges) {
    const from = r.start * 2;
    const to = Math.min(chars.length, (r.start + r.length) * 2);
    for (let i = from; i < to; i++) chars[i] = "0";
  }
  return chars.join("");
}

export type LocalContract = {
  /** deployedBytecode.object from solc: may contain __$..$__ library placeholders. */
  object: string;
  immutableRefs: Range[];
  linkRefs: Range[];
};

export type CompareResult = "exact" | "code" | null;

/**
 * Compare compiled runtime code to on-chain runtime code.
 * exact: executable part and metadata trailer both equal. code: executable part equal only.
 * Immutable slots and library link addresses are masked on both sides; nothing else is.
 */
export function compareRuntime(local: LocalContract, chainHex: string): CompareResult {
  const chain = splitMetadata(chainHex);
  if (!chain.decoded) return null;
  // Replace unlinked library placeholders (not hex) by zeros before splitting.
  const masked = maskRanges(strip0x(local.object).replace(/[^0-9a-f]/g, "0"), local.linkRefs);
  const loc = splitMetadata(masked);
  if (!loc.decoded) return null;
  if (loc.body.length < 2 || loc.body.length !== chain.body.length) return null;
  const ranges = [...local.immutableRefs, ...local.linkRefs];
  // solc >=0.8 libraries start with PUSH20 <own address> (zero in the compiled object, real on chain).
  if (loc.body.startsWith("73" + "00".repeat(20))) ranges.push({ start: 1, length: 20 });
  const a = maskRanges(loc.body, ranges);
  const b = maskRanges(chain.body, ranges);
  if (a !== b) return null;
  return loc.trailer === chain.trailer ? "exact" : "code";
}
