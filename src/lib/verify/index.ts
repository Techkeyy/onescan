import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keccak256, toBytes, type Hex } from "viem";
import type { CompilerSettings, Stage, StageId, VerifyFailureReason, VerifyInput, VerifyMatch, VerifyResult } from "../types";
import { CompileTimeout, ensureSoljson, listReleases, SolcRunner, type StandardOutput } from "./compiler";
import {
  candidateVersions, compareVersions, parseFoundryToml, parseHardhatConfig, parseRemappingsTxt, settingsCandidates, toCompilerSettings,
  type Candidate, type SettingsPart,
} from "./config";
import { VerifyFailure, VerifyUnavailableError } from "./errors";
import { buildGraph, closureOf, type Graph } from "./graph";
import { fetchRepoFiles, resolveCommit, validateRepo } from "./github";
import {
  autoRemappings, collectPackagePins, declaresDeployable, parseGitmodules, parseRemapping,
  type Remapping, type Submodule,
} from "./imports";
import { readGitlink } from "./gitlink";
import { guessNote, negativeVerdict } from "./verdict";
import { excludingPragma, parsePragmas, satisfiesPragma } from "./pragma";
import { compareRuntime, compareWhole, solcVersionFromMetadata, splitMetadata, type CompareResult, type Range } from "./metadata";
import { fetchTextOrNull, rpcCall } from "./net";
import { getCreation } from "../chain";

export { VerifyFailure, VerifyUnavailableError } from "./errors";

export const DEFAULT_RPC = "https://test-evm-rpc-v3.portaldot.dev";
/** Total time for a check (all commits tried). Override with ONESCAN_VERIFY_BUDGET_MS. */
export const BUDGET_MS = 300_000;
/** Share of the budget the default-branch pass may use when a fallback pass may follow. */
const FIRST_PASS_SHARE = 0.55;
/** One compile (one settings candidate or one file) may not eat the whole budget. Override with ONESCAN_COMPILE_TIMEOUT_MS. */
export const COMPILE_TIMEOUT_MS = 120_000;
const envMs = (name: string, dflt: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

export type VerifyOptions = {
  /** Total time for the whole check. Default 120 s. */
  budgetMs?: number;
  rpcUrl?: string;
  dataDir?: string;
};

const SKIP_DIRS = new Set(["node_modules", "test", "tests", "script", "scripts", "out", "artifacts", "cache", "lib", "dependencies"]);

/** Files that may be the deployed contract's source. Dependencies and tests can still be imported. */
export function isCompileRoot(path: string): boolean {
  const segs = path.split("/");
  if (segs.slice(0, -1).some((s) => SKIP_DIRS.has(s))) return false;
  return path.endsWith(".sol") && !path.endsWith(".t.sol") && !path.endsWith(".s.sol");
}

const STAGES: StageId[] = ["bytecode", "compiler", "repo", "compile", "compare"];

// Process-wide cache of dependency files (npm / GitHub raw). Only definitive answers are stored.
const textCache = new Map<string, string | null>();
async function fetchDependency(url: string): Promise<string | null> {
  if (textCache.has(url)) return textCache.get(url) ?? null;
  const host = new URL(url).host;
  const text = await fetchTextOrNull(host === "cdn.jsdelivr.net" ? "npm" : "github", url);
  if (textCache.size > 3000) textCache.clear();
  textCache.set(url, text);
  return text;
}

type Compiled = {
  file: string; // source-unit name
  name: string;
  object: string;
  immutableRefs: Range[];
  linkRefs: Range[];
  abi: unknown[];
};

function collect(out: StandardOutput, files: string[]): Compiled[] {
  const res: Compiled[] = [];
  for (const file of files) {
    for (const [name, c] of Object.entries(out.contracts?.[file] ?? {})) {
      const d = c.evm?.deployedBytecode;
      if (!d?.object) continue;
      const links: Range[] = [];
      for (const libs of Object.values(d.linkReferences ?? {})) for (const rs of Object.values(libs)) links.push(...rs);
      res.push({
        file, name, object: d.object,
        immutableRefs: Object.values(d.immutableReferences ?? {}).flat(),
        linkRefs: links,
        abi: c.abi ?? [],
      });
    }
  }
  return res;
}

function firstError(out: StandardOutput): string | null {
  const e = (out.errors ?? []).find((x) => x.severity === "error");
  if (!e) return null;
  return (e.formattedMessage ?? e.message).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" ").slice(0, 300);
}

const hasError = (out: StandardOutput) => (out.errors ?? []).some((e) => e.severity === "error");

type Ctx = {
  emit: (id: StageId, state: Stage["state"], detail?: string) => void;
  deadline: number;
  budget: number;
  perCompile: number;
  rpcUrl: string;
  dataDir?: string;
  /** Set by the first pass: fingerprint of everything that decides the compiled output. */
  fingerprint?: string;
  /** Set on the second pass: when the fingerprint is identical there is nothing new to compile. */
  skipIfSame?: string;
  identical?: boolean;
  /** Set when the deployed code stores no metadata (compiler version unknown). */
  noMeta?: boolean;
};

/** One complete check of one commit. Returns a result; throws only for caller bugs. */
async function verifyOnce(input: VerifyInput, ctx: Ctx): Promise<VerifyResult> {
  const { emit, deadline, budget, rpcUrl } = ctx;
  const options = { dataDir: ctx.dataDir };
  const PER_COMPILE_MS = ctx.perCompile;

  const address = input.address.toLowerCase() as `0x${string}`;
  const base: VerifyResult = {
    repo: input.repo,
    commit: /^[0-9a-f]{40}$/i.test(input.commit ?? "") ? (input.commit as string).toLowerCase() : "",
    address,
    runtimeHash: keccak256("0x"),
    sourceHash: null,
    compilerVersion: null,
    match: null,
    failure: null,
  };
  const fail = (stage: StageId, reason: VerifyFailureReason, detail: string): VerifyResult => {
    emit(stage, "failed", detail);
    return { ...base, failure: { reason, detail } };
  };

  if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) throw new RangeError("address must be a 0x-prefixed 20-byte hex string");

  let tmp: string | null = null;
  let runner: SolcRunner | null = null;
  try {
    // 1. bytecode and compiler version
    emit("bytecode", "running", "Reading deployed bytecode");
    const code = ((await rpcCall<string | null>(rpcUrl, "eth_getCode", [address, "latest"])) ?? "0x").toLowerCase();
    if (code === "0x" || code === "0x0") return fail("bytecode", "no_code", "Nothing is deployed at this address.");
    if (!/^0x([0-9a-f]{2})+$/.test(code)) throw new VerifyUnavailableError("rpc", "eth_getCode returned malformed data");
    base.runtimeHash = keccak256(code as Hex);
    if (code.startsWith("0x50564d")) {
      return fail("bytecode", "not_evm", "This is PolkaVM bytecode (starts with PVM). Only EVM contracts can be verified for now.");
    }
    emit("bytecode", "done", `${(code.length - 2) / 2} bytes, hash ${base.runtimeHash.slice(0, 12)}...`);

    emit("compiler", "running", "Reading compiler version from the bytecode metadata");
    const chain = splitMetadata(code);
    const noMeta = chain.decoded === null; // plain EVM code with no CBOR tail at all
    if (noMeta) {
      ctx.noMeta = true;
      emit("compiler", "running", "No compiler version stored in the code; choosing candidates from the repo's config and pragmas");
    } else {
      const version = solcVersionFromMetadata(chain.decoded);
      if (!version) {
        return fail("compiler", "no_compiler_metadata", "The bytecode has no readable solc version in its metadata, so the exact compiler cannot be chosen.");
      }
      base.compilerVersion = version;
      emit("compiler", "done", `solc ${version}`);
    }

    // 2. repo at a commit
    emit("repo", "running", "Resolving the commit");
    if (!validateRepo(input.repo)) return fail("repo", "repo_not_found", `"${input.repo}" is not a valid owner/name.`);
    let sha: string | null;
    try { sha = await resolveCommit(input.repo, input.commit); } catch (e) {
      if (e instanceof VerifyFailure) return fail("repo", e.reason, e.detail);
      throw e;
    }
    if (!sha) return fail("repo", "repo_not_found", `"${input.commit}" is an abbreviated commit. Use the full 40-character commit sha, a branch or a tag.`);
    base.commit = sha;
    emit("repo", "running", sha ? `Downloading ${input.repo} at ${sha.slice(0, 10)}` : `Downloading ${input.repo}`);
    tmp = await mkdtemp(join(tmpdir(), "onescan-"));
    let extracted;
    try {
      extracted = await fetchRepoFiles(input.repo, sha, tmp);
    } catch (e) {
      if (e instanceof VerifyFailure) return fail("repo", e.reason, e.detail);
      throw e;
    }
    if (extracted.rootSha) {
      if (sha && extracted.rootSha !== sha) throw new VerifyUnavailableError("github", "archive commit does not match the requested commit");
      base.commit = extracted.rootSha;
    }
    if (!/^[0-9a-f]{40}$/.test(base.commit)) throw new VerifyUnavailableError("github", "could not determine the full commit sha");

    // read extracted files
    const text = new Map<string, string>();
    for (const f of extracted.files) text.set(f, await readFile(join(tmp, ...f.split("/")), "utf8"));
    const depth = (p: string) => p.split("/").length;
    const shallowest = (pred: (p: string) => boolean) => [...text.keys()].filter(pred).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
    const foundryPath = shallowest((p) => p.split("/").pop() === "foundry.toml");
    const hardhatPath = shallowest((p) => /(^|\/)hardhat\.config\.(js|cjs|mjs|ts)$/.test(p));
    const dirOf = (p: string | undefined) => (p ? p.split("/").slice(0, -1).join("/") : null);
    const fDir = dirOf(foundryPath);
    const hDir = dirOf(hardhatPath);
    const projectRoot = fDir !== null && (hDir === null || depth(fDir || "x") <= depth(hDir || "x")) ? fDir : (hDir ?? "");
    const prefix = projectRoot ? projectRoot + "/" : "";
    const keyOf = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);

    const fp = keccak256(toBytes(JSON.stringify([
      [...text.entries()]
        .filter(([p]) => !p.endsWith(".toml") || p.endsWith("foundry.toml")) // every text file read so far decides the build
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    ])));
    if (ctx.skipIfSame && ctx.skipIfSame === fp) {
      ctx.identical = true;
      return fail("repo", "no_match", "All Solidity sources and build settings are identical to the commit already checked, so the result would be the same.");
    }
    ctx.fingerprint = fp;
    const repoFiles = new Map<string, string>();
    for (const [p, t] of text) if (p.endsWith(".sol")) repoFiles.set(keyOf(p), t);
    const rootKeys = [...repoFiles.keys()].filter((k) => isCompileRoot(k) && declaresDeployable(repoFiles.get(k) as string));
    const yulFiles = [...text.keys()].filter((p) => p.endsWith(".yul"));
    const yulNote = yulFiles.length ? ` The repo also contains Yul sources (${yulFiles.slice(0, 2).join(", ")}) that OneScan cannot compile; the deployed contract may be one of those.` : "";
    if (rootKeys.length === 0) {
      if (yulFiles.length > 0) {
        return fail("repo", "no_solidity", `OneScan checks Solidity. The deployable code in ${input.repo} looks hand-written in Yul (${yulFiles.slice(0, 2).join(", ")}), which OneScan cannot compile yet. This is not a verdict against the repo.`);
      }
      if (![...repoFiles.keys()].some(isCompileRoot)) {
        return fail("repo", "no_solidity", `${input.repo} has no Solidity source files outside tests, scripts and dependencies.`);
      }
      return fail("repo", "no_solidity", `${input.repo} has Solidity files but none declares a deployable contract or library.`);
    }

    // settings from the project's own config (text parsing only)
    let parsed: SettingsPart | null = null;
    const remapStrings: string[] = [];
    if (foundryPath && (fDir ?? "") === projectRoot) {
      const f = parseFoundryToml(text.get(foundryPath) as string);
      parsed = f;
      remapStrings.push(...f.remappings);
    } else if (hardhatPath && (hDir ?? "") === projectRoot) {
      parsed = parseHardhatConfig(text.get(hardhatPath) as string);
    }
    const remapPath = `${prefix}remappings.txt`;
    if (text.has(remapPath)) remapStrings.push(...parseRemappingsTxt(text.get(remapPath) as string));
    const userRemaps = remapStrings.map(parseRemapping).filter((r): r is Remapping => r !== null);
    const rawSubs = text.has(".gitmodules")
      ? parseGitmodules(text.get(".gitmodules") as string).filter((s) => !prefix || s.path.startsWith(prefix))
      : [];
    // Pin every submodule at the commit the repo records for it; a failed read leaves it unpinned (= guessed).
    const subs: Submodule[] = await Promise.all(
      rawSubs.map(async (s) => {
        const r = await readGitlink(input.repo, s.path, base.commit);
        return { ...s, path: keyOf(s.path), pin: "sha" in r ? r.sha : null };
      }),
    );
    const remaps = [...autoRemappings(subs, userRemaps), ...userRemaps];
    const { versions, pinned: pinnedPkgs } = collectPackagePins(
      [...text.entries()].filter(([p]) => /(^|\/)package(-lock)?\.json$/.test(p)).map(([path, t]) => ({ path, text: t })),
    );
    emit("repo", "done", `${input.repo} @ ${base.commit.slice(0, 10)}: ${repoFiles.size} Solidity files, ${rootKeys.length} candidate sources`);

    // 3. dependency graph
    emit("compile", "running", "Resolving imports");
    const graph: Graph = await buildGraph({ repoFiles, roots: rootKeys, remaps, subs, versions, pinnedPkgs, fetchText: fetchDependency });
    const allRemaps = [...userRemaps, ...remaps.filter((r) => !userRemaps.includes(r))].map((r) => `${r.context ? r.context + ":" : ""}${r.prefix}=${r.target}`);

    type Hit = { c: Compiled; kind: Exclude<CompareResult, null>; cand: Candidate };
    type Attempt = {
      version: string;
      found: Hit | null;
      noRoots: "pragma" | "imports" | null;
      noRootsDetail: string;
      tried: number;
      total: number;
      timedOut: number;
      budgetOut: boolean;
      anyCompiled: boolean;
      compiledFiles: number;
      extra: string;
      extraFiles: string;
      firstError: string | null;
      /** Dependencies of the compiled sources that are not known to be the repo's pinned versions. */
      guessed: string[];
    };

    /** Compile every candidate source with one solc version under the settings ladder and compare. */
    const attempt = async (version: string, label: string): Promise<Attempt> => {
      const res: Attempt = {
        version, found: null, noRoots: null, noRootsDetail: "", tried: 0, total: 0, timedOut: 0, budgetOut: false,
        anyCompiled: false, compiledFiles: 0, extra: "", extraFiles: "", firstError: null, guessed: [],
      };
      const okRoots: string[] = [];
      const brokenRoots: string[] = [];
      const notes: string[] = [];
      const pragmaBlocked: string[] = [];
      for (const r of rootKeys) {
        const c = closureOf(graph, r);
        const bad = excludingPragma(c.keys.map((k) => graph.sources.get(k) as string), version);
        if (bad) { pragmaBlocked.push(`${r} (pragma solidity ${bad})`); continue; }
        if (c.missing.length === 0) okRoots.push(r);
        else { brokenRoots.push(r); if (notes.length < 3) notes.push(c.missing[0]); }
      }
      res.guessed = [...new Set(okRoots.flatMap((r) => closureOf(graph, r).guesses))];
      if (okRoots.length === 0 && pragmaBlocked.length > 0 && notes.length === 0) {
        res.noRoots = "pragma";
        res.guessed = [...new Set(graph.guesses.values())];
        res.noRootsDetail = pragmaBlocked.slice(0, 3).join("; ");
        return res;
      }
      if (okRoots.length === 0) {
        res.noRoots = "imports";
        res.noRootsDetail = notes.join("; ");
        return res;
      }

      emit("compile", "running", `${label}Loading solc ${version}`);
      const soljson = await ensureSoljson(version, options.dataDir);
      runner?.close();
      runner = new SolcRunner(soljson);
      const candidates = settingsCandidates(version, parsed);
      res.total = candidates.length;
      const stripLocal = noMeta && compareVersions(version, "0.8.18") < 0;

      const good = new Set<string>(okRoots);
      const retryable = new Set<string>();
      const lastError = new Map<string, string>();

      const compileSet = async (files: string[], cand: Candidate): Promise<StandardOutput> => {
        const keys = new Set<string>();
        for (const f of files) for (const k of closureOf(graph, f).keys) keys.add(k);
        const sources: Record<string, { content: string }> = {};
        for (const k of keys) sources[k] = { content: graph.sources.get(k) as string };
        const selection: Record<string, Record<string, string[]>> = {};
        for (const f of files) selection[f] = { "*": ["abi", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences", "evm.deployedBytecode.linkReferences"] };
        const settings: Record<string, unknown> = {
          optimizer: { enabled: cand.optimizer.enabled, runs: cand.optimizer.runs },
          outputSelection: selection,
        };
        if (cand.viaIR) settings.viaIR = true;
        if (cand.evmVersion) settings.evmVersion = cand.evmVersion;
        if (allRemaps.length) settings.remappings = allRemaps;
        if (noMeta) {
          // Code stored without metadata: compile the same way (metadata never changes executable code).
          if (compareVersions(version, "0.8.18") >= 0) settings.metadata = { appendCBOR: false, bytecodeHash: "none" };
          else if (compareVersions(version, "0.6.0") >= 0) settings.metadata = { bytecodeHash: "none" };
        }
        const remaining = deadline - Date.now();
        return (runner as SolcRunner).compile({ language: "Solidity", sources, settings }, Math.min(PER_COMPILE_MS, remaining));
      };

      const compareAll = (items: Compiled[]): { c: Compiled; kind: Exclude<CompareResult, null> } | null => {
        let best: { c: Compiled; kind: Exclude<CompareResult, null> } | null = null;
        for (const c of items.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))) {
          const local = { object: c.object, immutableRefs: c.immutableRefs, linkRefs: c.linkRefs };
          // No stored metadata means no fingerprint to compare: the best possible verdict is "code".
          const kind: CompareResult = noMeta ? (compareWhole(local, code, stripLocal) ? "code" : null) : compareRuntime(local, code);
          if (kind === "exact") return { c, kind };
          if (kind === "code" && !best) best = { c, kind };
        }
        return best;
      };

      for (let i = 0; i < candidates.length && !res.found; i++) {
        if (Date.now() >= deadline) { res.budgetOut = true; break; }
        const cand = candidates[i];
        const tag = `${label}attempt ${i + 1}/${candidates.length}: ${cand.label}`;
        emit("compile", "running", tag);
        const items: Compiled[] = [];
        try {
          const runFiles = async (files: string[]) => {
            if (files.length === 0) return;
            const out = await compileSet(files, cand);
            if (!hasError(out)) { items.push(...collect(out, files)); return; }
            // A broken file must not sink the others: compile each with its own import closure.
            for (const f of files) {
              if (Date.now() >= deadline) { res.budgetOut = true; return; }
              emit("compile", "running", `${tag} (compiling files one by one)`);
              const one = await compileSet([f], cand);
              if (hasError(one)) {
                good.delete(f);
                lastError.set(f, firstError(one) ?? "compile error");
                if (/stack too deep|evm|via-?ir|code size|memory|yul|out of gas/i.test(lastError.get(f) as string)) retryable.add(f);
                else retryable.delete(f);
              } else {
                good.add(f);
                retryable.delete(f);
                items.push(...collect(one, [f]));
              }
            }
          };
          await runFiles([...good]);
          if (!res.budgetOut) for (const f of [...retryable]) { if (!good.has(f)) await runFiles([f]); }
        } catch (e) {
          if (e instanceof CompileTimeout) {
            if (Date.now() >= deadline) res.budgetOut = true;
            lastError.set("*", e.message);
            res.timedOut++;
            res.tried++;
            continue;
          }
          throw e;
        }
        res.tried++;
        if (items.length > 0) res.anyCompiled = true;
        res.compiledFiles = Math.max(res.compiledFiles, new Set(items.map((x) => x.file)).size);
        emit("compile", "done", `${tag}: ${items.length} contracts compiled`);
        emit("compare", "running", `${tag}: comparing ${items.length} contracts with the deployed code`);
        const m = compareAll(items);
        if (m) res.found = { ...m, cand };
        if (res.budgetOut) break;
      }

      res.extra = brokenRoots.length ? ` ${brokenRoots.length} source file(s) were skipped because their imports could not be found.` : "";
      const failedFiles = [...lastError.keys()].filter((k) => k !== "*").length;
      res.extraFiles = failedFiles ? ` ${failedFiles} file(s) did not compile with solc ${version}.` : "";
      res.firstError = [...lastError.values()][0] ?? null;
      return res;
    };

    const matched = (a: Attempt): VerifyResult => {
      const { c, kind, cand } = a.found as Hit;
      const settings: CompilerSettings = toCompilerSettings(a.version, cand);
      const source = graph.sources.get(c.file) as string;
      const match: VerifyMatch = {
        kind,
        file: prefix + c.file,
        contract: c.name,
        settings,
        abi: c.abi,
        source,
        deploymentCommitOf: null,
      };
      base.compilerVersion = a.version;
      emit("compile", "done", `Compiled with solc ${a.version}, ${cand.label}`);
      emit("compare", "done", kind === "exact" ? `Exact match: ${match.file}:${c.name}` : `Code match: ${match.file}:${c.name} (${noMeta ? "no metadata stored in the deployed code to compare" : "metadata hash differs"})`);
      return { ...base, match, sourceHash: keccak256(toBytes(source)) };
    };

    if (!noMeta) {
      const version = base.compilerVersion as string;
      const a = await attempt(version, "");
      if (a.noRoots === "pragma") {
        const detail = `The repo's Solidity pragma does not allow the deployed compiler version solc ${version}, so none of its contracts can have produced this code. ${a.noRootsDetail}`;
        // A pragma that comes from a dependency we had to guess proves nothing about the repo.
        if (a.guessed.length > 0) return fail("compare", "inconclusive", `${detail} ${guessNote(a.guessed)} This is not a verdict against the repo.`.slice(0, 500));
        return fail("compare", "no_match", detail.slice(0, 400));
      }
      if (a.noRoots === "imports") return fail("compile", "compile_failed", `Imports could not be found. ${a.noRootsDetail}`.slice(0, 400));
      if (a.found) return matched(a);
      const complete = !a.budgetOut && a.timedOut === 0 && a.tried === a.total;
      if (!complete) {
        // Not every settings combination was compiled and compared: never a negative verdict.
        const done = a.tried - a.timedOut;
        const why = a.budgetOut
          ? `the ${Math.round(budget / 1000)}s time budget ran out`
          : `${a.timedOut} combination(s) did not finish compiling within ${PER_COMPILE_MS / 1000}s`;
        return fail(
          "compare", "inconclusive",
          `Only ${done} of ${a.total} settings combinations were compiled and compared (${why}). This is not a negative verdict: the code may still match.${a.extra}${a.extraFiles}`,
        );
      }
      const verdict = negativeVerdict({
        complete,
        anyCompiled: a.anyCompiled,
        guessed: a.guessed,
        partial: !!(a.extra || a.extraFiles),
      });
      if (verdict === "compile_failed") {
        return fail("compile", "compile_failed", `Nothing compiled with solc ${version}: ${a.firstError ?? "no deployable contract compiled"}`.slice(0, 400));
      }
      if (verdict === "inconclusive") {
        return fail(
          "compare", "inconclusive",
          a.guessed.length > 0
            ? `All ${a.tried} settings combinations were compared and none reproduced the code, but ${guessNote(a.guessed)} This is not a verdict against the repo: with the dependency versions it really used it may still match.${a.extra}${a.extraFiles}`.slice(0, 700)
            : `All ${a.tried} settings combinations were compared and none reproduced the code, but not every source file could be built.${a.extra}${a.extraFiles} The deployed contract may be one of those files, so this is not a verdict against the repo.`,
        );
      }
      return fail(
        "compare", "no_match",
        `Compiled ${a.compiledFiles} source file(s) with solc ${version} under all ${a.tried} settings combinations; none produced the deployed code.${a.extra}${a.extraFiles}`,
      );
    }

    // No metadata in the deployed code: the compiler version is unknown, so try the likely ones.
    const releases = await listReleases(options.dataDir);
    const rootPragmas = rootKeys.map((r) => closureOf(graph, r).keys.flatMap((k) => parsePragmas(graph.sources.get(k) as string)));
    const picks = candidateVersions({ configVersion: parsed?.solcVersion ?? null, rootPragmas, releases, satisfies: satisfiesPragma });
    if (picks.length === 0) {
      return fail("compiler", "no_compiler_metadata", "The code stores no compiler version and the repo's config and pragmas do not point to a released solc version, so nothing could be tried. This is not a verdict against the repo.");
    }
    emit("compiler", "done", `No compiler version stored in the code; will try ${picks.map((p) => `solc ${p.version}`).join(", ")}`);
    const results: Attempt[] = [];
    let totalTried = 0;
    let totalCombos = 0;
    let pinnedDone: string | null = null;
    for (const p of picks) {
      if (Date.now() >= deadline) break;
      const label = `No compiler version stored in the code; trying solc ${p.version} (${p.why}): `;
      emit("compiler", "running", label.slice(0, -2));
      const a = await attempt(p.version, label);
      results.push(a);
      totalTried += a.tried - a.timedOut;
      totalCombos += a.total;
      if (a.found) {
        emit("compiler", "done", `solc ${p.version} (${p.why}) reproduces the deployed code`);
        return matched(a);
      }
      // The repo told us its compiler: once that version's whole ladder ran, guessing other versions only burns time.
      if (p.why.startsWith("pinned") && a.total > 0 && !a.budgetOut && a.timedOut === 0 && a.tried === a.total) {
        pinnedDone = p.version;
        break;
      }
    }
    const names = results.map((a, i) => `${a.version} (${picks[i].why})`).join(", ");
    const timeouts = results.reduce((n, a) => n + a.timedOut, 0);
    const budgetOut = results.some((a) => a.budgetOut) || (results.length < picks.length && pinnedDone === null);
    const nothing = results.every((a) => !a.anyCompiled);
    const blocked = results.filter((a) => a.noRoots).length;
    const notes: string[] = [];
    if (blocked) notes.push(`${blocked} version(s) were skipped because the sources' pragma or imports ruled them out`);
    if (budgetOut) notes.push(`the ${Math.round(budget / 1000)}s time budget ran out`);
    if (timeouts) notes.push(`${timeouts} combination(s) timed out`);
    const first = results.find((a) => a.firstError)?.firstError;
    if (nothing && !budgetOut && timeouts === 0 && first) notes.push(`nothing compiled: ${first}`);
    if (pinnedDone) notes.push(`the repo pins solc ${pinnedDone} and every settings combination was tried with it, so other versions were not guessed`);
    const guessedAll = [...new Set(results.flatMap((a) => a.guessed))];
    if (guessedAll.length > 0) notes.push(guessNote(guessedAll));
    return fail(
      "compiler", "no_compiler_metadata",
      `The deployed code stores no compiler version, so the exact compiler is unknown. Tried solc ${names}: ${totalTried} settings combinations compiled and compared, none reproduced the code${notes.length ? ` (${notes.join("; ")})` : ""}. This is NOT a verdict against the repo: the code may still come from it with another compiler or settings.${yulNote}`.slice(0, 900),
    );
  } catch (e) {
    if (e instanceof VerifyUnavailableError) {
      const stage: StageId = e.service === "rpc" ? "bytecode" : e.service === "github" ? "repo" : "compile";
      return fail(stage, "unavailable", e.message.slice(0, 400));
    }
    throw e;
  } finally {
    (runner as SolcRunner | null)?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Timestamp of the first block that has code at the address (binary search), or null. Works without a creating transaction. */
async function firstCodeBlockTime(rpcUrl: string, address: string): Promise<number | null> {
  const hex = (n: number) => "0x" + n.toString(16);
  const head = Number(await rpcCall<string>(rpcUrl, "eth_blockNumber", []));
  const has = async (n: number) => {
    const c = await rpcCall<string | null>(rpcUrl, "eth_getCode", [address, hex(n)]);
    return !!c && c !== "0x";
  };
  if (!(await has(head))) return null;
  let lo = 0;
  let hi = head;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await has(mid)) hi = mid; else lo = mid + 1;
  }
  const block = await rpcCall<{ timestamp?: string } | null>(rpcUrl, "eth_getBlockByNumber", [hex(lo), false]);
  const ts = block?.timestamp ? Number(block.timestamp) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

/** Last commit on the default branch made before the given unix time (GitHub REST; optional GITHUB_TOKEN). */
async function lastCommitBefore(repo: string, unixSeconds: number): Promise<{ sha: string } | { note: string }> {
  const v = validateRepo(repo);
  if (!v) return { note: "invalid repo" };
  const until = new Date(unixSeconds * 1000).toISOString();
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "onescan-verify" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${v.owner}/${v.name}/commits?until=${encodeURIComponent(until)}&per_page=1`, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { note: `GitHub could not be reached (${(e as Error).message})` };
  }
  if (res.status === 403 || res.status === 429) return { note: "the GitHub API rate limit was hit, so the commit before deployment could not be looked up (set GITHUB_TOKEN to raise it)" };
  if (!res.ok) return { note: `the GitHub API answered HTTP ${res.status}` };
  try {
    const list = (await res.json()) as { sha?: string }[];
    const sha = list[0]?.sha;
    return sha && /^[0-9a-f]{40}$/.test(sha) ? { sha } : { note: "the repo has no commit before the deployment time" };
  } catch {
    return { note: "the GitHub API reply was not readable" };
  }
}

export async function verify(
  input: VerifyInput,
  onStage: (stage: Stage) => void,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const budget = options.budgetMs ?? envMs("ONESCAN_VERIFY_BUDGET_MS", BUDGET_MS);
  const deadline = Date.now() + budget;
  const perCompile = envMs("ONESCAN_COMPILE_TIMEOUT_MS", COMPILE_TIMEOUT_MS);
  const rpcUrl = options.rpcUrl ?? process.env.EVM_RPC_URL ?? DEFAULT_RPC;
  let prefix = "";
  const latest = new Map<StageId, Stage>();
  const emit = (id: StageId, state: Stage["state"], detail?: string) => {
    const d = detail === undefined ? undefined : prefix + detail;
    latest.set(id, d === undefined ? { id, state } : { id, state, detail: d });
    try { onStage(d === undefined ? { id, state } : { id, state, detail: d }); } catch { /* UI errors never affect the verdict */ }
  };
  for (const id of STAGES) emit(id, "pending");
  const ctx: Ctx = { emit, deadline, budget, perCompile, rpcUrl, dataDir: options.dataDir };

  // Without a pinned commit, keep part of the budget in reserve for the deployment-commit fallback.
  const specified = (input.commit ?? "").trim() !== "";
  const firstBudget = specified ? budget : Math.round(budget * FIRST_PASS_SHARE);
  const ctx1: Ctx = { ...ctx, budget: firstBudget, deadline: specified ? deadline : deadline - (budget - firstBudget) };
  const first = await verifyOnce(input, ctx1);
  const f = first.failure;
  const firstStages = new Map(latest);
  // Stages always end on the pass the verdict rests on, not on an abandoned retry.
  const restoreFirst = () => {
    prefix = "";
    for (const id of STAGES) {
      const s = firstStages.get(id);
      if (s) emit(id, s.state, s.detail);
    }
  };
  // A specified commit is never second-guessed. Only genuine negatives and timeouts try the deployment commit.
  if (first.match || specified || !f || (f.reason !== "no_match" && f.reason !== "inconclusive" && !(f.reason === "no_compiler_metadata" && ctx1.noMeta))) return first;

  const addNote = (note: string): VerifyResult => (restoreFirst(), { ...first, failure: { reason: f.reason, detail: `${f.detail} Also tried to check the repo's last commit before deployment: ${note}.` } });
  const remaining = deadline - Date.now();
  if (remaining < 15_000) return addNote("no time budget was left");

  emit("repo", "running", "Not matched at the default branch; looking up the repo's last commit before deployment");
  let stamp: number | null = null;
  try {
    const creation = await getCreation(input.address);
    stamp = creation ? creation.timestamp : await firstCodeBlockTime(rpcUrl, input.address); // contracts created by a Substrate extrinsic have no creating tx
  } catch (e) { return addNote(`the deployment time could not be read (${(e as Error).message})`); }
  if (stamp === null) return addNote("the deployment time of this contract could not be found");
  const t = stamp > 1e12 ? Math.floor(stamp / 1000) : stamp;
  const found = await lastCommitBefore(input.repo, t);
  if ("note" in found) return addNote(found.note);
  if (found.sha === first.commit) return addNote("it is the same commit that was already checked");

  prefix = `Deployment commit ${found.sha.slice(0, 10)}: `;
  emit("repo", "running", "Retrying at the repo's last commit before the contract was deployed");
  for (const id of STAGES) emit(id, "pending");
  ctx.skipIfSame = ctx1.fingerprint;
  const second = await verifyOnce({ ...input, commit: found.sha }, ctx);
  if (ctx.identical) {
    restoreFirst();
    return { ...first, failure: { reason: f.reason, detail: `${f.detail} The repo's last commit before deployment (${found.sha.slice(0, 10)}) has identical Solidity sources and settings, so it was not compiled again.` } };
  }
  if (second.match) {
    return { ...second, match: { ...second.match, deploymentCommitOf: "HEAD" } };
  }
  const g = second.failure;
  const both = `${f.detail} Also tried the repo's last commit before deployment (${found.sha.slice(0, 10)}): ${g ? g.detail : "no result"}`;
  const reason: VerifyFailureReason = ctx1.noMeta
    ? f.reason // unknown compiler: never upgraded to a verdict, never downgraded
    : g && (g.reason === "inconclusive" || g.reason === "unavailable") ? "inconclusive" : f.reason;
  return { ...first, failure: { reason, detail: both.slice(0, 700) } };
}
