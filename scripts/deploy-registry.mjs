// Deploys contracts/out ProofRegistry. Dry run unless --send is passed.
// Env: DEPLOYER_PRIVATE_KEY, ATTESTER_ADDRESS, EVM_RPC_URL (optional). Reads .env.local if present.
// Never prints a private key.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, formatEther, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const file = resolve(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

loadEnvLocal();
const send = process.argv.includes("--send");

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const attester = process.env.ATTESTER_ADDRESS;
if (!deployerKey || !/^0x[0-9a-fA-F]{64}$/.test(deployerKey)) fail("DEPLOYER_PRIVATE_KEY is missing or malformed");
if (!attester || !isAddress(attester)) fail("ATTESTER_ADDRESS is missing or not an address");

const artifactPath = resolve(root, "contracts/out/ProofRegistry.sol/ProofRegistry.json");
if (!existsSync(artifactPath)) fail("artifact not found; run `forge build` in contracts/");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const bytecode = artifact.bytecode?.object;
if (!bytecode || bytecode === "0x") fail("artifact has no bytecode");

const rpcUrl = process.env.EVM_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev";
const chain = defineChain({
  id: 420420777,
  name: "Portaldot V3 Testnet",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const account = privateKeyToAccount(deployerKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

const balance = await publicClient.getBalance({ address: account.address });
const gas = await publicClient.estimateGas({
  account,
  data: encodeDeployData({ abi: artifact.abi, bytecode, args: [attester] }),
});
const gasPrice = await publicClient.getGasPrice();
const gasCost = gas * gasPrice;

console.log(`network:          chain ${chain.id} via ${rpcUrl}`);
console.log(`deployer:         ${account.address}`);
console.log(`attester:         ${attester}`);
console.log(`balance:          ${formatEther(balance)} tPOT`);
console.log(`estimated gas:    ${gas} at ${gasPrice} wei`);
console.log(`estimated cost:   ${formatEther(gasCost)} tPOT (gas only; the storage deposit is extra and refundable)`);

if (!send) {
  console.log("dry run: nothing sent. Pass --send to deploy.");
  process.exit(0);
}

if (balance < gasCost) fail("deployer balance is below the estimated gas cost");

const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
const txHash = await walletClient.deployContract({ abi: artifact.abi, bytecode, args: [attester] });
console.log(`tx hash:          ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") fail(`deployment reverted in tx ${txHash}`);
console.log(`address:          ${receipt.contractAddress}`);
console.log(`block:            ${receipt.blockNumber}`);
