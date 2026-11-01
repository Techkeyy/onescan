// Live tests: real Portaldot V3 RPC, GitHub and the Solidity compiler binaries. Slow on a cold cache.
import { describe, expect, it } from "vitest";
import type { Stage, VerifyResult } from "../types";
import { verify } from "./index";
import { resolveCommit } from "./github";

const NODESCOPE = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c" as const;
const REVIVESCOPE = "0xe0ba8adf0cd660f5875aca70a98e466f30855dec" as const;
const POLKAVM = "0xeebc363c7af7ed8e888da07e959043517ae4b97d" as const; // starts 0x50564d, found via eth_getLogs + eth_getCode
const NO_CODE = "0x000000000000000000000000000000000000dEaD" as const;
const T = 800_000;

const run = async (repo: string, address: `0x${string}`, commit?: string) => {
  const stages: Stage[] = [];
  const t = Date.now();
  const r: VerifyResult = await verify({ repo, address, commit }, (s) => stages.push(s));
  console.log(`LIVE ${repo} ${address} -> ${r.match ? "MATCH " + r.match.kind + " " + r.match.file + ":" + r.match.contract : r.failure?.reason + " | " + r.failure?.detail} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return { r, stages };
};

describe("live verification", () => {
  it("Firzadf/nodescope matches its deployed contract exactly", async () => {
    const { r, stages } = await run("Firzadf/nodescope", NODESCOPE);
    expect(r.failure).toBeNull();
    expect(r.match?.kind).toBe("exact");
    expect(r.match?.contract).toBe("NodeScopeAttestation");
    expect(r.compilerVersion).toBe("0.8.24");
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.sourceHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.match?.abi.length).toBeGreaterThan(0);
    expect(r.match?.source).toContain("contract NodeScopeAttestation");
    const ids = new Set(stages.map((s) => s.id));
    expect([...ids].sort()).toEqual(["bytecode", "compare", "compile", "compiler", "repo"]);
    expect(stages.some((s) => s.id === "compile" && /attempt 1\//.test(s.detail ?? ""))).toBe(true);
  }, T);

  it("Gieez/portaldot-revivescope matches its deployed contract", async () => {
    const { r } = await run("Gieez/portaldot-revivescope", REVIVESCOPE);
    expect(r.failure).toBeNull();
    expect(["exact", "code"]).toContain(r.match?.kind);
  }, T);

  it("FALSE CLAIM: revivescope repo against the nodescope address is no_match", async () => {
    const { r } = await run("Gieez/portaldot-revivescope", NODESCOPE);
    expect(r.match).toBeNull();
    expect(r.sourceHash).toBeNull();
    expect(r.failure?.reason).toBe("no_match");
    // the default branch did not match, so the commit before deployment was looked for too
    expect(r.failure?.detail).toMatch(/before deployment/i);
  }, T);

  it("FALSE CLAIM the other way: nodescope repo against the revivescope address is no_match", async () => {
    const { r } = await run("Firzadf/nodescope", REVIVESCOPE);
    expect(r.match).toBeNull();
    expect(r.failure?.reason).toBe("no_match");
  }, T);

  it("a tiny budget on a REAL match is inconclusive, never no_match", async () => {
    const r = await verify({ repo: "Firzadf/nodescope", address: NODESCOPE }, () => {}, { budgetMs: 1 });
    console.log("LIVE tiny budget ->", r.failure?.reason, "|", r.failure?.detail);
    expect(r.match).toBeNull();
    expect(r.failure?.reason).toBe("inconclusive");
    expect(r.failure?.detail).toMatch(/Only d+ of d+ settings combinations|not a negative verdict|time budget/i);
  }, T);

  it("a specified commit never falls back to the deployment commit", async () => {
    const head = await resolveCommit("Gieez/portaldot-revivescope", undefined);
    const stages: Stage[] = [];
    const r = await verify({ repo: "Gieez/portaldot-revivescope", address: NODESCOPE, commit: head as string }, (s) => stages.push(s));
    console.log("LIVE explicit commit ->", r.failure?.reason, "|", r.failure?.detail);
    expect(r.failure?.reason).toBe("no_match");
    expect(r.failure?.detail).not.toMatch(/before deployment/i);
    expect(stages.some((s) => /deployment commit/i.test(s.detail ?? ""))).toBe(false);
  }, T);

  it("address with no code is no_code", async () => {
    const { r } = await run("Firzadf/nodescope", NO_CODE);
    expect(r.failure?.reason).toBe("no_code");
  }, T);

  it("nonexistent repo is repo_not_found", async () => {
    const { r } = await run("Techkeyy/this-repo-does-not-exist-9f3a1", NODESCOPE);
    expect(r.failure?.reason).toBe("repo_not_found");
  }, T);

  it("unknown commit is repo_not_found", async () => {
    const { r } = await run("Firzadf/nodescope", NODESCOPE, "no-such-branch-zzz");
    expect(r.failure?.reason).toBe("repo_not_found");
  }, T);

  it("a real PolkaVM contract is not_evm", async () => {
    const { r } = await run("Firzadf/nodescope", POLKAVM);
    expect(r.failure?.reason).toBe("not_evm");
  }, T);
});
