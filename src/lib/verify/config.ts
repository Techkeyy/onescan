// Read-only, text-level parsing of project config. Nothing from the repo is ever executed or evaluated.
import type { CompilerSettings } from "../types";

export type SettingsPart = {
  optimizer?: boolean;
  runs?: number;
  viaIR?: boolean;
  evmVersion?: string;
  /** Pinned compiler, e.g. "0.8.24" (foundry solc / solc_version, hardhat solidity version). */
  solcVersion?: string;
  /** foundry cbor_metadata / hardhat metadata.appendCBOR. */
  cborMetadata?: boolean;
  /** foundry bytecode_hash / hardhat metadata.bytecodeHash. */
  bytecodeHash?: string;
};

/** "0.8.24" or "v0.8.24" -> "0.8.24"; anything else (paths, ranges, "auto") -> undefined. */
export function cleanSolcVersion(s: string): string | undefined {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(s.trim());
  return m ? m[1] : undefined;
}

export type RepoConfig = SettingsPart & { remappings: string[] };

function stripTomlComment(line: string): string {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

function tomlStrings(text: string): string[] {
  return Array.from(text.matchAll(/"([^"]*)"|'([^']*)'/g)).map((m) => m[1] ?? m[2]);
}

/** Minimal foundry.toml reader: [profile.default] (or top-level) scalar keys and remappings. */
export function parseFoundryToml(text: string): RepoConfig {
  const out: RepoConfig = { remappings: [] };
  const lines = text.split(/\r?\n/).map(stripTomlComment);
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) { section = sec[1].trim(); continue; }
    if (section !== "profile.default" && section !== "") continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].replace(/-/g, "_");
    let value = kv[2].trim();
    if (value.startsWith("[") && !value.includes("]")) {
      while (++i < lines.length) {
        value += " " + lines[i].trim();
        if (lines[i].includes("]")) break;
      }
    }
    if (key === "optimizer") { if (/^(true|false)$/.test(value)) out.optimizer = value === "true"; }
    else if (key === "optimizer_runs") { const n = Number(value.replace(/_/g, "")); if (Number.isInteger(n) && n >= 0) out.runs = n; }
    else if (key === "via_ir") { if (/^(true|false)$/.test(value)) out.viaIR = value === "true"; }
    else if (key === "evm_version") { const s = tomlStrings(value)[0]; if (s && /^[a-z0-9]+$/i.test(s)) out.evmVersion = s.toLowerCase(); }
    else if (key === "solc" || key === "solc_version") { const s = tomlStrings(value)[0]; const v = s ? cleanSolcVersion(s) : undefined; if (v) out.solcVersion = v; }
    else if (key === "cbor_metadata") { if (/^(true|false)$/.test(value)) out.cborMetadata = value === "true"; }
    else if (key === "bytecode_hash") { const s = tomlStrings(value)[0]; if (s && /^[a-z0-9]+$/i.test(s)) out.bytecodeHash = s.toLowerCase(); }
    else if (key === "remappings") out.remappings.push(...tomlStrings(value));
  }
  return out;
}

/** remappings.txt: one per line, # comments. */
export function parseRemappingsTxt(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="));
}

/** Regex-only read of the first optimizer / viaIR / evmVersion in a hardhat config. */
export function parseHardhatConfig(raw: string): SettingsPart {
  const out: SettingsPart = {};
  // Cut after the last "}" so the optimizer block always has a closing brace ahead; without this a file
  // of repeated "optimizer: {" backtracked quadratically.
  const text = raw.slice(0, raw.lastIndexOf("}") + 1);
  const opt = /optimizer\s*:\s*\{([^}]*)\}/.exec(text);
  if (opt) {
    const en = /enabled\s*:\s*(true|false)/.exec(opt[1]);
    if (en) out.optimizer = en[1] === "true";
    const runs = /runs\s*:\s*([\d_]+)/.exec(opt[1]);
    if (runs) out.runs = Number(runs[1].replace(/_/g, ""));
  }
  const via = /viaIR\s*:\s*(true|false)/.exec(text);
  if (via) out.viaIR = via[1] === "true";
  const evm = /evmVersion\s*:\s*["']([A-Za-z0-9]+)["']/.exec(text);
  if (evm) out.evmVersion = evm[1].toLowerCase();
  const ver = /solidity\s*:\s*["'](v?\d+\.\d+\.\d+)["']/.exec(text) ?? /\bversion\s*:\s*["'](v?\d+\.\d+\.\d+)["']/.exec(text);
  if (ver) out.solcVersion = cleanSolcVersion(ver[1]);
  const cbor = /appendCBOR\s*:\s*(true|false)/.exec(text);
  if (cbor) out.cborMetadata = cbor[1] === "true";
  const bh = /bytecodeHash\s*:\s*["']([A-Za-z0-9]+)["']/.exec(text);
  if (bh) out.bytecodeHash = bh[1].toLowerCase();
  return out;
}

export type Candidate = { optimizer: { enabled: boolean; runs: number }; viaIR: boolean; evmVersion: string | null; label: string };

function label(c: Omit<Candidate, "label">): string {
  const parts = [c.optimizer.enabled ? `optimizer ${c.optimizer.runs}` : "optimizer off"];
  if (c.viaIR) parts.push("viaIR");
  if (c.evmVersion) parts.push(`evm ${c.evmVersion}`);
  return parts.join(", ");
}

function make(enabled: boolean, runs: number, viaIR: boolean, evmVersion: string | null): Candidate {
  const base = { optimizer: { enabled, runs }, viaIR, evmVersion };
  return { ...base, label: label(base) };
}

/** Evm versions solc accepts, by the first solc release that supports them. */
const EVM_SINCE: Record<string, string> = { paris: "0.8.18", london: "0.8.7", shanghai: "0.8.20", cancun: "0.8.24" };

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).slice(0, 3).map(Number);
  const pb = b.split(/[.+-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export function isSupported(c: Candidate, version: string): boolean {
  if (c.viaIR && compareVersions(version, "0.8.13") < 0) return false;
  if (c.evmVersion) {
    const since = EVM_SINCE[c.evmVersion];
    if (since && compareVersions(version, since) < 0) return false;
  }
  return true;
}

/** Ordered, de-duplicated candidates: repo's own settings first, then the fixed ladder. */
export function settingsCandidates(version: string, parsed: SettingsPart | null): Candidate[] {
  const list: Candidate[] = [];
  if (parsed && (parsed.optimizer !== undefined || parsed.runs !== undefined || parsed.viaIR !== undefined || parsed.evmVersion)) {
    list.push(make(parsed.optimizer ?? true, parsed.runs ?? 200, parsed.viaIR ?? false, parsed.evmVersion ?? null));
  }
  list.push(make(true, 200, false, null), make(false, 200, false, null));
  for (const runs of [1, 1000, 10000]) list.push(make(true, runs, false, null));
  for (const evm of ["paris", "london", "shanghai", "cancun"]) list.push(make(true, 200, false, evm));
  // size-optimised builds avoiding PUSH0 are common on this chain (code deposit is per byte)
  list.push(make(true, 1, false, "paris"));
  // viaIR is by far the slowest, so these go last
  list.push(make(true, 200, true, null), make(true, 1, true, null), make(true, 1, true, "paris"), make(true, 200, true, "paris"));
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.optimizer.enabled}|${c.optimizer.runs}|${c.viaIR}|${c.evmVersion}`;
    if (seen.has(k) || !isSupported(c, version)) return false;
    seen.add(k);
    return true;
  });
}

export function toCompilerSettings(version: string, c: Candidate): CompilerSettings {
  return { version, optimizer: { ...c.optimizer }, viaIR: c.viaIR, evmVersion: c.evmVersion };
}

// ---------- compiler version candidates for code that stores no metadata ----------

export type VersionPick = { version: string; why: string };

const COMMON = ["0.8.24", "0.8.20", "0.8.28", "0.8.30"];

/**
 * Up to 4 solc versions to try, in order: the repo's pinned version, an exact pragma version,
 * the highest release the pragmas allow, then common versions the pragmas allow.
 * rootPragmas: for every candidate source file, the pragma ranges across its import closure.
 */
export function candidateVersions(o: {
  configVersion: string | null;
  rootPragmas: string[][];
  releases: string[]; // highest first
  satisfies: (range: string, version: string) => boolean;
}): VersionPick[] {
  const have = new Set(o.releases);
  const score = (v: string) => o.rootPragmas.filter((rs) => rs.every((r) => o.satisfies(r, v))).length;
  const out: VersionPick[] = [];
  const add = (version: string, why: string) => {
    if (have.has(version) && !out.some((p) => p.version === version) && out.length < 4) out.push({ version, why });
  };
  if (o.configVersion) add(o.configVersion, "pinned in the repo's config");
  const exact = new Map<string, number>();
  for (const rs of o.rootPragmas) for (const r of rs) {
    const m = /^=?\s*(\d+\.\d+\.\d+)$/.exec(r.trim());
    if (m) exact.set(m[1], (exact.get(m[1]) ?? 0) + 1);
  }
  for (const [v] of [...exact.entries()].sort((a, b) => b[1] - a[1] || compareVersions(b[0], a[0]))) add(v, "exact version in the pragma");
  const best = o.releases.length ? Math.max(...o.releases.map(score)) : 0;
  const top = o.releases.find((v) => score(v) === best);
  if (top && best > 0) add(top, "highest release the pragma allows");
  for (const v of COMMON) if (best > 0 && score(v) === best) add(v, "common version the pragma allows");
  return out;
}
