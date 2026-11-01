// Runs against a local anvil with chain id 420420777. No Portaldot RPC is ever contacted.
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attest, type AttestInput } from "./attest";
import type { Attestation } from "./types";

const ROOT = resolve(__dirname, "../..");
const CONTRACTS = resolve(ROOT, "contracts");
const PORT = 18545;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN = defineChain({
  id: 420420777,
  name: "local anvil",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

// Public anvil dev keys. Local chain only.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ATTESTER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const STRANGER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const registryAbi = [
  {
    type: "function",
    name: "record",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "runtimeHash", type: "bytes32" },
      { name: "sourceHash", type: "bytes32" },
      { name: "commit", type: "bytes20" },
      { name: "repo", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recordedRuntimeHash",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const artifactPath = resolve(CONTRACTS, "out/ProofRegistry.sol/ProofRegistry.json");
const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });
const deployer = createWalletClient({ account: privateKeyToAccount(DEPLOYER_KEY), chain: CHAIN, transport: http(RPC) });
const ATTESTER_ADDRESS = privateKeyToAccount(ATTESTER_KEY).address;

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_HASH = keccak256("0x1234");

let anvil: ChildProcess | null = null;
let registry: `0x${string}`;
let otherRegistry: `0x${string}`;
const savedEnv = { ATTESTER_PRIVATE_KEY: process.env.ATTESTER_PRIVATE_KEY, REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS, EVM_RPC_URL: process.env.EVM_RPC_URL };

async function waitForRpc(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("anvil did not start");
}

async function deployRegistry(): Promise<`0x${string}`> {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const hash = await deployer.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [ATTESTER_ADDRESS] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("deploy failed");
  return receipt.contractAddress;
}

beforeAll(async () => {
  if (!existsSync(artifactPath)) {
    execFileSync("forge", ["build"], { cwd: CONTRACTS, stdio: "inherit" });
  }
  anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "420420777", "--silent"], { stdio: "ignore" });
  anvil.on("error", () => {});
  await waitForRpc();
  registry = await deployRegistry();
  otherRegistry = await deployRegistry();
}, 120_000);

afterAll(() => {
  anvil?.kill();
});

beforeEach(() => {
  process.env.EVM_RPC_URL = RPC;
  process.env.ATTESTER_PRIVATE_KEY = ATTESTER_KEY;
  process.env.REGISTRY_ADDRESS = registry;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function runtimeHashOf(address: `0x${string}`): Promise<`0x${string}`> {
  const code = await publicClient.getCode({ address });
  if (!code) throw new Error("no code at target");
  return keccak256(code);
}

function input(target: `0x${string}`, runtimeHash: `0x${string}`): AttestInput {
  return { address: target, runtimeHash, sourceHash: SOURCE_HASH, commit: COMMIT, repo: "owner/name" };
}

describe("attest", () => {
  it("returns none and sends nothing when no key is configured", async () => {
    delete process.env.ATTESTER_PRIVATE_KEY;
    const seen: Attestation[] = [];
    const result = await attest(input(registry, await runtimeHashOf(registry)), (a) => seen.push(a));
    expect(result).toEqual({ state: "none", registry: null, txHash: null, error: null });
    expect(seen).toEqual([]);
  });

  it("returns none when the registry address is missing", async () => {
    delete process.env.REGISTRY_ADDRESS;
    const result = await attest(input(registry, await runtimeHashOf(registry)), () => {});
    expect(result.state).toBe("none");
  });

  it("goes requested -> submitted -> confirmed on a good record, and the chain agrees", async () => {
    const seen: Attestation[] = [];
    const runtimeHash = await runtimeHashOf(registry);
    const result = await attest(input(registry, runtimeHash), (a) => seen.push(a));

    expect(seen.map((a) => a.state)).toEqual(["requested", "submitted", "confirmed"]);
    expect(seen[1].txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.state).toBe("confirmed");
    expect(result.txHash).toBe(seen[1].txHash);
    expect(result.error).toBeNull();

    const receipt = await publicClient.getTransactionReceipt({ hash: result.txHash! });
    expect(receipt.status).toBe("success");
    const stored = await publicClient.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "recordedRuntimeHash",
      args: [registry],
    });
    expect(stored).toBe(runtimeHash);
  });

  it("fails with a clear error on a wrong runtimeHash and sends nothing", async () => {
    const seen: Attestation[] = [];
    const result = await attest(input(registry, keccak256("0xdead")), (a) => seen.push(a));
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/CodeMismatch/);
    expect(result.txHash).toBeNull();
    expect(seen.map((a) => a.state)).toEqual(["requested", "failed"]);
  });

  it("fails with NotAttester when the configured key is not the attester", async () => {
    process.env.ATTESTER_PRIVATE_KEY = STRANGER_KEY;
    const result = await attest(input(registry, await runtimeHashOf(registry)), () => {});
    expect(result.state).toBe("failed");
    expect(result.error).toMatch(/NotAttester/);
  });

  it("serialises concurrent sends so both confirm without nonce collisions", async () => {
    const [a, b] = await Promise.all([
      attest(input(registry, await runtimeHashOf(registry)), () => {}),
      attest(input(otherRegistry, await runtimeHashOf(otherRegistry)), () => {}),
    ]);
    expect(a.state).toBe("confirmed");
    expect(b.state).toBe("confirmed");
    expect(a.txHash).not.toBe(b.txHash);
  });
});
