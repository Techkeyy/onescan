// Shared contracts between the engine, API and UI. Change only with director approval.

export type VmKind = "evm" | "polkavm" | "none";

/** code = executable bytecode matches; exact = metadata hash matches too. */
export type MatchKind = "exact" | "code";

export type CompilerSettings = {
  version: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  evmVersion: string | null;
};

export type VerifyInput = {
  repo: string; // "owner/name"
  commit?: string; // sha, tag or branch; defaults to the default branch
  address: `0x${string}`;
};

export type StageId = "bytecode" | "compiler" | "repo" | "compile" | "compare";

export type Stage = {
  id: StageId;
  state: "pending" | "running" | "done" | "failed";
  detail?: string;
};

export type VerifyMatch = {
  kind: MatchKind;
  file: string; // repo-relative path
  contract: string;
  settings: CompilerSettings;
  abi: unknown[];
  source: string; // source text of the matched file
  /** Set when the requested ref did not match but the repo's last commit before deployment did. */
  deploymentCommitOf: string | null; // the ref originally requested
};

export type VerifyFailureReason =
  | "no_code" // nothing deployed at the address
  | "not_evm" // PolkaVM bytecode, not supported yet
  | "no_compiler_metadata" // bytecode has no solc version
  | "repo_not_found"
  | "repo_too_large"
  | "no_solidity" // repo has no Solidity files
  | "compile_failed"
  | "no_match" // compiled fine, nothing matched: a real negative verdict
  | "inconclusive" // ran out of time before trying everything: never a negative verdict
  | "unavailable" // RPC, GitHub, npm or the compiler download could not be reached
  | "interrupted" // server restarted while the check was running
  | "internal_error"; // the check itself threw

export type VerifyResult = {
  repo: string;
  commit: string; // resolved 40-char sha
  address: `0x${string}`;
  runtimeHash: `0x${string}`; // keccak256 of on-chain runtime code
  sourceHash: `0x${string}` | null; // keccak256 of matched source file
  compilerVersion: string | null;
  match: VerifyMatch | null;
  failure: { reason: VerifyFailureReason; detail: string } | null;
};

export type JobState = "queued" | "running" | "matched" | "no_match" | "failed";

export type Job = {
  id: string;
  input: VerifyInput;
  state: JobState;
  stages: Stage[];
  failure: VerifyResult["failure"];
  createdAt: number;
  updatedAt: number;
};

export type Creation = {
  block: number;
  txHash: `0x${string}`;
  deployer: `0x${string}`;
  timestamp: number;
};

export type ActivityItem = {
  txHash: `0x${string}`;
  block: number;
  topic0: `0x${string}` | null;
  eventName: string | null; // decoded from the verified ABI when known
};

export type Activity = {
  logCount: number;
  txCount: number;
  recent: ActivityItem[]; // newest first, at most 10
};

/** requested -> submitted -> confirmed, or failed. "none" means no attester configured. */
export type AttestationState = "none" | "requested" | "submitted" | "confirmed" | "failed";

export type Attestation = {
  state: AttestationState;
  registry: `0x${string}` | null;
  txHash: `0x${string}` | null;
  error: string | null;
};

/** A stored proof exists only for a real match. Failed checks stay private to their job. */
export type Proof = {
  address: `0x${string}`;
  repo: string;
  commit: string;
  match: VerifyMatch;
  runtimeHash: `0x${string}`;
  sourceHash: `0x${string}`;
  attestation: Attestation;
  checkedAt: number;
};

/** What /api/proof/[address] returns: the stored proof, re-checked against the live chain. */
export type ProofView = Proof & {
  /** current = live bytecode still has runtimeHash; changed = it does not; unknown = RPC failed. */
  live: "current" | "changed" | "unknown";
  vm: VmKind;
  creation: Creation | null;
  activity: Activity | null;
};

export type AddressView = {
  input: string;
  /** native = 5… account; h160 = what EVM tools see for it. */
  native: string;
  h160: `0x${string}`;
  /** eth = 0x key account (MetaMask); native = 5… key account. */
  origin: "eth" | "native";
  /** native-origin accounts must be mapped before the 0x side can act for them. */
  mapped: boolean;
  /** Decimal base-unit strings; null when that side could not be read. */
  nativeFree: string | null; // 14 decimals
  evmBalance: string | null; // 18 decimals
  vm: VmKind;
  proof: { repo: string; kind: MatchKind } | null;
};

/** What the site shows as live: real chain and queue state, never decoration. */
export type Pulse = {
  block: number | null; // null when the chain could not be read
  queued: number;
  proofs: number;
  exact: number;
  latest: { address: `0x${string}`; repo: string; contract: string; kind: MatchKind; commit: string; checkedAt: number }[];
};

/** A quick read of an address before running a check. */
export type Preflight = {
  vm: VmKind;
  bytes: number;
  compiler: string | null;
  proof: { repo: string; kind: MatchKind } | null;
};
