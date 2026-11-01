// Server-only: holds the attester key and sends transactions. Never import from client code.
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Attestation } from "./types";

export const PORTALDOT_CHAIN_ID = 420420777;
const DEFAULT_RPC = "https://test-evm-rpc-v3.portaldot.dev";

const registryAbi = parseAbi([
  "function record(address target, bytes32 runtimeHash, bytes32 sourceHash, bytes20 commit, string repo)",
  "error NotAttester()",
  "error CodeMismatch()",
]);

export type AttestInput = {
  address: `0x${string}`;
  runtimeHash: `0x${string}`;
  sourceHash: `0x${string}`;
  commit: string; // 40-char hex sha, with or without 0x
  repo: string;
};

export function attesterChain(rpcUrl: string) {
  return defineChain({
    id: PORTALDOT_CHAIN_ID,
    name: "Portaldot V3 Testnet",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

// Every send runs through this chain, so two attestations never race for the same nonce.
let sendQueue: Promise<void> = Promise.resolve();

function describeError(e: unknown): string {
  // viem decodes custom reverts (CodeMismatch, NotAttester) into the cause chain, not the top message.
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur && typeof cur === "object"; i++) {
    const errorName = (cur as { data?: { errorName?: unknown } }).data?.errorName;
    if (typeof errorName === "string" && errorName) return `contract reverted: ${errorName}`;
    cur = (cur as { cause?: unknown }).cause;
  }
  if (e && typeof e === "object") {
    const short = (e as { shortMessage?: unknown }).shortMessage;
    if (typeof short === "string" && short) return short;
    if (e instanceof Error && e.message) return e.message;
  }
  return String(e);
}

function safeUpdate(onUpdate: (a: Attestation) => void, a: Attestation) {
  try {
    onUpdate(a);
  } catch {
    // A failing UI callback must not stop or corrupt the send.
  }
}

async function send(
  p: AttestInput,
  registry: `0x${string}`,
  key: `0x${string}`,
  rpcUrl: string,
  onUpdate: (a: Attestation) => void,
): Promise<Attestation> {
  const failed = (error: string, txHash: Hex | null = null): Attestation => ({
    state: "failed",
    registry,
    txHash,
    error,
  });
  try {
    const hex = p.commit.startsWith("0x") ? p.commit : `0x${p.commit}`;
    if (!/^0x[0-9a-fA-F]{40}$/.test(hex)) return failed("commit must be a 40-character hex sha");

    const chain = attesterChain(rpcUrl);
    const account = privateKeyToAccount(key);
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

    // Simulate first: a rejected record fails here with the contract's own error, before any transaction exists.
    const { request } = await publicClient.simulateContract({
      account,
      address: registry,
      abi: registryAbi,
      functionName: "record",
      args: [p.address, p.runtimeHash, p.sourceHash, hex as `0x${string}`, p.repo],
    });

    // Gas is estimated by viem at send time; nothing is hardcoded.
    const txHash = await walletClient.writeContract(request);
    safeUpdate(onUpdate, { state: "submitted", registry, txHash, error: null });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return failed("transaction reverted on chain", txHash);
    }
    return { state: "confirmed", registry, txHash, error: null };
  } catch (e) {
    return failed(describeError(e));
  }
}

/**
 * Records a proof on the ProofRegistry. Reports requested, then submitted (with txHash),
 * then confirmed only after the receipt succeeds, or failed with a message.
 * Returns state "none" without doing anything when ATTESTER_PRIVATE_KEY or REGISTRY_ADDRESS is unset.
 */
export async function attest(
  p: AttestInput,
  onUpdate: (a: Attestation) => void,
): Promise<Attestation> {
  const key = process.env.ATTESTER_PRIVATE_KEY;
  const registry = process.env.REGISTRY_ADDRESS;
  if (!key || !registry) {
    return { state: "none", registry: null, txHash: null, error: null };
  }
  const rpcUrl = process.env.EVM_RPC_URL || DEFAULT_RPC;
  const reg = registry as `0x${string}`;

  safeUpdate(onUpdate, { state: "requested", registry: reg, txHash: null, error: null });

  const run = sendQueue.then(() => send(p, reg, key as `0x${string}`, rpcUrl, onUpdate));
  sendQueue = run.then(
    () => undefined,
    () => undefined,
  );
  const result = await run;
  safeUpdate(onUpdate, result);
  return result;
}
