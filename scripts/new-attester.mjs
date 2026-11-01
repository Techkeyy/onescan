// Generates an attester key into .env.local and prints only the public address.
// Refuses to run if ATTESTER_PRIVATE_KEY is already present. Never prints the key.
// ENV_LOCAL_PATH overrides the target file (used for testing).
import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.env.ENV_LOCAL_PATH || resolve(root, ".env.local");

const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
if (/^\s*ATTESTER_PRIVATE_KEY\s*=/m.test(existing)) {
  console.error(`error: ATTESTER_PRIVATE_KEY already exists in ${file}; not overwriting`);
  process.exit(1);
}

const key = generatePrivateKey();
const line = `ATTESTER_PRIVATE_KEY=${key}\n`;
if (existing) {
  appendFileSync(file, (existing.endsWith("\n") ? "" : "\n") + line);
} else {
  writeFileSync(file, line, { mode: 0o600 });
}
console.log(privateKeyToAccount(key).address);
