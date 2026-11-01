import { decodeEventLog, type Abi } from "viem";
import type { Activity, ActivityItem, Creation, VmKind } from "./types";

export const EVM_RPC_URL = () => process.env.EVM_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev";
const TIMEOUT_MS = 15_000;

type Hex = `0x${string}`;
let nextId = 1;

export async function rpc<T = unknown>(method: string, params: unknown[] = [], timeoutMs = TIMEOUT_MS): Promise<T> {
  const res = await fetch(EVM_RPC_URL(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
  return j.result as T;
}

async function rpcBatch<T>(calls: [string, unknown[]][], timeoutMs = TIMEOUT_MS): Promise<T[]> {
  if (calls.length === 0) return [];
  const base = nextId;
  nextId += calls.length;
  const res = await fetch(EVM_RPC_URL(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls.map(([method, params], i) => ({ jsonrpc: "2.0", id: base + i, method, params }))),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const arr = (await res.json()) as { id: number; result?: T; error?: { message: string } }[];
  const byId = new Map(arr.map((r) => [r.id, r]));
  return calls.map((_, i) => {
    const r = byId.get(base + i);
    if (!r || r.error) throw new Error(`RPC batch: ${r?.error?.message ?? "missing response"}`);
    return r.result as T;
  });
}

const hexN = (n: number) => "0x" + n.toString(16);

export async function getCode(address: string, block: string = "latest"): Promise<Hex> {
  return (await rpc<Hex>("eth_getCode", [address, block])) ?? "0x";
}

export async function getBlockNumber(): Promise<number> {
  return Number(await rpc<string>("eth_blockNumber"));
}

export async function getBalance(address: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));
}

export function vmKind(code: string): VmKind {
  if (code === "0x" || code === "") return "none";
  if (code.toLowerCase().startsWith("0x50564d")) return "polkavm";
  return "evm";
}

type Tx = { hash: Hex; from: Hex; to: Hex | null };
type Block = { timestamp: string; transactions: Tx[] };

/**
 * Finds the block where code first appears (binary search on historical eth_getCode),
 * then the transaction in it whose receipt.contractAddress is this address.
 * Returns null when the contract has no code, or no transaction in that block created it
 * directly (factory-created contracts have no such receipt). Throws if the RPC fails.
 */
export async function getCreation(address: string): Promise<Creation | null> {
  const addr = address.toLowerCase();
  const head = await getBlockNumber();
  if ((await getCode(addr, hexN(head))) === "0x") return null;
  let lo = 0;
  let hi = head; // invariant: code present at hi
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await getCode(addr, hexN(mid))) === "0x") lo = mid + 1;
    else hi = mid;
  }
  const block = await rpc<Block | null>("eth_getBlockByNumber", [hexN(lo), true]);
  if (!block) return null;
  const creators = block.transactions.filter((t) => t.to === null);
  if (creators.length === 0) return null;
  const receipts = await rpcBatch<{ contractAddress: string | null } | null>(
    creators.map((t) => ["eth_getTransactionReceipt", [t.hash]]),
  );
  const i = receipts.findIndex((r) => r?.contractAddress?.toLowerCase() === addr);
  if (i < 0) return null;
  return {
    block: lo,
    txHash: creators[i].hash,
    deployer: creators[i].from.toLowerCase() as Hex,
    timestamp: Number(block.timestamp),
  };
}

type Log = { transactionHash: Hex; blockNumber: string; logIndex: string; topics: Hex[]; data: Hex };

export async function getActivity(address: string, abi?: unknown[]): Promise<Activity> {
  const logs = await rpc<Log[]>("eth_getLogs", [{ address, fromBlock: "0x0", toBlock: "latest" }], 30_000);
  const txCount = new Set(logs.map((l) => l.transactionHash)).size;
  const newest = [...logs]
    .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber) || Number(b.logIndex) - Number(a.logIndex))
    .slice(0, 10);
  const recent: ActivityItem[] = newest.map((l) => {
    let eventName: string | null = null;
    if (abi && l.topics.length > 0) {
      try {
        eventName =
          decodeEventLog({ abi: abi as Abi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }).eventName ?? null;
      } catch {
        eventName = null;
      }
    }
    return { txHash: l.transactionHash, block: Number(l.blockNumber), topic0: l.topics[0] ?? null, eventName };
  });
  return { logCount: logs.length, txCount, recent };
}
