import type { Proof } from "./types";

export const proofFixture = (over: Partial<Proof> = {}): Proof => ({
  address: "0xd48da7eff3264bdd51a86b873da9ff6997aae99c",
  repo: "a/b",
  commit: "c".repeat(40),
  match: {
    kind: "code",
    file: "A.sol",
    contract: "A",
    settings: { version: "0.8.20", optimizer: { enabled: true, runs: 200 }, viaIR: false, evmVersion: null },
    abi: [],
    source: "contract A {}",
  },
  runtimeHash: "0x" + "11".repeat(32) as `0x${string}`,
  sourceHash: "0x" + "22".repeat(32) as `0x${string}`,
  attestation: { state: "none", registry: null, txHash: null, error: null },
  checkedAt: 1000,
  ...over,
});

