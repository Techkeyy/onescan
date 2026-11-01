import { compareVersions } from "./config";
import { stripComments } from "./imports";

/** `pragma solidity` range strings of a source, e.g. "^0.8.20", ">=0.7.0 <0.9.0". */
export function parsePragmas(src: string): string[] {
  const out: string[] = [];
  for (const m of stripComments(src).matchAll(/pragma\s+solidity\s+([^;]+);/g)) out.push(m[1].trim());
  return out;
}

const parseV = (s: string): number[] => {
  const p = s.replace(/^v/, "").split(".").map((x) => (x === "x" || x === "*" || x === "" ? 0 : Number(x)));
  while (p.length < 3) p.push(0);
  return p.slice(0, 3);
};

/** Exclusive upper bound: ^0.y.z -> 0.(y+1).0, ^x.y.z -> (x+1).0.0, ~x.y.z -> x.(y+1).0 */
function upper(v: number[], op: "^" | "~"): string {
  if (op === "~") return `${v[0]}.${v[1] + 1}.0`;
  return v[0] === 0 ? `0.${v[1] + 1}.0` : `${v[0] + 1}.0.0`;
}

/** Does a solc version satisfy one pragma range? Unknown syntax returns true (never wrongly excludes). */
export function satisfiesPragma(range: string, version: string): boolean {
  return range.split("||").some((alt) => {
    const tokens = alt.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/).filter(Boolean);
    return tokens.every((t) => {
      const m = /^(>=|<=|>|<|=|\^|~)?(v?[0-9xX*]+(?:\.[0-9xX*]+){0,2})$/.exec(t);
      if (!m) return true;
      const op = m[1] ?? "=";
      const raw = m[2].replace(/X/g, "x");
      const parts = raw.split(".");
      const v = parseV(raw);
      const vs = v.join(".");
      const partial = parts.length < 3 || raw.includes("x") || raw.includes("*");
      switch (op) {
        case ">=": return compareVersions(version, vs) >= 0;
        case ">": return partial ? compareVersions(version, partial && parts.length === 1 ? `${v[0] + 1}.0.0` : `${v[0]}.${v[1] + 1}.0`) >= 0 : compareVersions(version, vs) > 0;
        case "<=": return compareVersions(version, vs) <= 0;
        case "<": return compareVersions(version, vs) < 0;
        case "^": return compareVersions(version, vs) >= 0 && compareVersions(version, upper(v, "^")) < 0;
        case "~": return compareVersions(version, vs) >= 0 && compareVersions(version, upper(v, "~")) < 0;
        default:
          if (!partial) return compareVersions(version, vs) === 0;
          if (parts.length === 1) return compareVersions(version, vs) >= 0 && compareVersions(version, `${v[0] + 1}.0.0`) < 0;
          return compareVersions(version, vs) >= 0 && compareVersions(version, `${v[0]}.${v[1] + 1}.0`) < 0;
      }
    });
  });
}

/** First pragma in the given source texts that excludes the version, or null. */
export function excludingPragma(texts: string[], version: string): string | null {
  for (const t of texts) for (const p of parsePragmas(t)) if (!satisfiesPragma(p, version)) return p;
  return null;
}
