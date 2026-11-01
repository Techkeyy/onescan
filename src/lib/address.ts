// Pure and browser-safe. Address maths between Portaldot's 5... (SS58) and 0x (H160) forms.
import { decodeAddress, encodeAddress, keccakAsU8a } from "@polkadot/util-crypto";
import { hexToU8a, u8aToHex } from "@polkadot/util";

export const SS58_PREFIX = 42;
const EE = 0xee;

export type ParsedAddress = {
  input: string;
  /** SS58 prefix 42. For a 0x input this is the eth-origin mapping unless the chain says otherwise. */
  native: string;
  h160: `0x${string}`;
  origin: "eth" | "native";
  /** What the input looked like. A 0x input cannot be classified by maths alone. */
  inputKind: "h160" | "ss58";
};

const H160_RE = /^0x[0-9a-fA-F]{40}$/;

export function isH160(s: string): s is `0x${string}` {
  return H160_RE.test(s);
}

/** 0x -> the 5... account an eth-origin key maps to: H160 ++ twelve 0xEE bytes. */
export function toTwin(h160: string): string {
  const bytes = new Uint8Array(32);
  bytes.set(hexToU8a(h160.toLowerCase()), 0);
  bytes.fill(EE, 20);
  return encodeAddress(bytes, SS58_PREFIX);
}

/** Returns null for anything that is not a valid 0x H160 or SS58 address. */
export function parseAddress(raw: string): ParsedAddress | null {
  const input = raw.trim();
  if (isH160(input)) {
    const h160 = input.toLowerCase() as `0x${string}`;
    return { input, native: toTwin(h160), h160, origin: "eth", inputKind: "h160" };
  }
  let id: Uint8Array;
  try {
    id = decodeAddress(input); // accepts any SS58 prefix, verifies checksum
  } catch {
    return null;
  }
  if (id.length !== 32) return null;
  const native = encodeAddress(id, SS58_PREFIX);
  if (id.slice(20).every((b) => b === EE)) {
    return { input, native, h160: u8aToHex(id.slice(0, 20)) as `0x${string}`, origin: "eth", inputKind: "ss58" };
  }
  const h160 = u8aToHex(keccakAsU8a(id).slice(12)) as `0x${string}`;
  return { input, native, h160, origin: "native", inputKind: "ss58" };
}

/** A 0x input whose on-chain originalAccount is known: the true native account. */
export function withOriginalAccount(p: ParsedAddress, accountId32: Uint8Array): ParsedAddress {
  return { ...p, native: encodeAddress(accountId32, SS58_PREFIX), origin: "native" };
}
