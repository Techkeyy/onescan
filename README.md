# OneScan

OneScan checks whether a public GitHub repo is the code running at a contract address on Portaldot V3, and gives a verdict anyone can recheck.

**[Live app](https://onescan.103-195-188-198.sslip.io)** · **[Source](https://github.com/Techkeyy/onescan)** · [API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Audit](docs/AUDIT.md) · [Third-party notices](NOTICE.md)

For builders who want to prove a contract, and for judges, integrators and users who want to check someone else's. No account, no wallet.

> *"This repo says it is the contract at that address. Is it?"*

Built for Portaldot Hacker House 2026, track Node Operations & Tooling.

## Why this exists

On Portaldot V3 anyone can put a GitHub link next to a contract address. Nothing on the chain shows that the code in the repo is the code that is running.

Verification services exist on other chains. Sourcify and Etherscan check source against deployed bytecode there. OneScan does the same kind of check for Portaldot V3 testnet EVM contracts.

OneScan is not an explorer. For blocks, transactions and address lookups on this chain, use [Pindex](https://github.com/youthisguy/portalIndex). OneScan answers one question: does this repo match this address.

```
   repo + commit                                  contract address
        |                                                |
   compile with the exact                        eth_getCode on the
   solc version the chain's                      Portaldot V3 EVM RPC
   bytecode names in its metadata                        |
        |                                                |
        +---- strip metadata, mask immutables ----------+
                              |
                  same?  yes: proof page, badge, optional on-chain record
                         no:  refused, never listed
```

## What it does

1. **Reads** the code at the address (`eth_getCode`). Empty code and PolkaVM code are reported as such, not verified.
2. **Reads** the solc version from the CBOR metadata at the end of the bytecode.
3. **Fetches** the repo at a commit over GitHub's git protocol and tarball, extracting only Solidity and build config files. Branches and tags resolve to a full commit first.
4. **Resolves** imports from the repo, from git submodules, and from npm packages (versions taken from `package-lock.json`, then `package.json`). Config in `foundry.toml`, `remappings.txt` and `hardhat.config.*` is read as text. Nothing from the repo is ever executed.
5. **Compiles** with the exact solc release, in a worker thread with a timeout. The repo's own optimizer settings are tried first, then a fixed ladder of common settings.
6. **Compares** runtime bytecode with the metadata hash stripped and immutable values masked. Identical including metadata is an `exact` match. Identical otherwise is a `code` match.
7. **Says "no match" only if every combination was tried.** A timeout is `inconclusive` and an outage is `unavailable`. Neither is a verdict against the repo.
8. **Falls back** to the repo's last commit before the contract was deployed, when the branch you gave no longer matches because the code changed afterwards.
9. **Stores** a match as a public proof page and a README badge. Failed checks are never listed. Each time the proof page or badge is opened, the stored hash is compared with the live bytecode again.
10. **Records** the match on the `ProofRegistry` contract when a registry and attester key are configured. The registry reverts unless the target's `EXTCODEHASH` equals the hash being recorded.

## Try it in 60 seconds

Open the live app and press "Watch it refuse a false claim" on the landing page, or open the Check page (`/check`) and paste these.

| # | Repo | Address | What you should see |
| --- | --- | --- | --- |
| 1 | `Firzadf/nodescope` | `0xd48da7eff3264bdd51a86b873da9ff6997aae99c` | Exact match. 5 seconds on the production server. |
| 2 | `Gieez/portaldot-revivescope` | `0xd48da7eff3264bdd51a86b873da9ff6997aae99c` | Refused: a real repo, but not the code at NodeScope's address. 32 seconds, because every settings combination is tried before saying no. |
| 3 | `Rohitamalraj/DotProof` | `0x7e3444c1f9dbd53dea5ebc8160522b154857566b` | Fails at the default branch, then matches exactly at the repo's last commit before deployment, because the code changed after it was deployed. 93 seconds. |

These are other builders' public repos, used as test inputs. Example 3 is slower than 60 seconds; it is there because it shows the fallback.

A PolkaVM contract (`0xeebc363c7af7ed8e888da07e959043517ae4b97d`) is reported as unsupported rather than guessed at.

The same check from a terminal:

```bash
curl -X POST http://localhost:3000/api/check \
  -H 'content-type: application/json' \
  -d '{"repo":"Firzadf/nodescope","address":"0xd48da7eff3264bdd51a86b873da9ff6997aae99c"}'
# {"id":"..."}   then poll GET /api/check/<id> until state is matched, no_match or failed
```

## Run it locally

Needs Node 22.13 or later (the store uses `node:sqlite`; developed on Node 24, running on Node 22 in production) and network access to the Portaldot V3 testnet RPC, GitHub, and the Solidity compiler binaries.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
```

No environment variable is required to run. These are read by the code, all optional:

| Variable | Used for | Default |
| --- | --- | --- |
| `EVM_RPC_URL` | EVM JSON-RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| `NATIVE_WS_URL` | Substrate node for the address page | `wss://test-node-v3.portaldot.dev` |
| `NEXT_PUBLIC_NATIVE_WS_URL` | Same, for the Fund panel in the browser | same as above |
| `DATA_DIR` | SQLite database (proofs, jobs) | `./data` |
| `ONESCAN_DATA_DIR` | Downloaded solc binaries cache | `./data` |
| `GITHUB_TOKEN` | Raises the GitHub API limit for the "commit before deployment" lookup | unset |
| `ONESCAN_VERIFY_BUDGET_MS` | Total time for one check | 300000 |
| `ONESCAN_COMPILE_TIMEOUT_MS` | Time for one compile | 120000 |
| `REGISTRY_ADDRESS`, `ATTESTER_PRIVATE_KEY` | Together enable on-chain records. Server only. Put them in `.env.local`, which is git-ignored | unset: records are skipped |
| `NEXT_PUBLIC_REPO_URL` | Adds a "Source code" link in the footer | unset |

`DATA_DIR` and `ONESCAN_DATA_DIR` are separate variables; set both to the same folder.

To make an attester key without printing it, run `node scripts/new-attester.mjs` (prints only the address). `scripts/deploy-registry.mjs` is a dry run unless you pass `--send`.

### Tests

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript | `npm test` | 14 files, 106 tests, all passed, in 16 minutes |
| Solidity | `forge test` in `contracts/` | 8 tests, all passed |

Includes 79 tests of the check engine, with live runs against the real chain, GitHub and compiler.

`live.test.ts` and `oz.test.ts` call the real testnet RPC, GitHub and the compiler binaries, which is why the run is slow. `attest.test.ts` starts a local `anvil` (from Foundry), so it needs Foundry on your PATH. It never contacts Portaldot.

## How I tried to break it

| Input | Result | Where it is exercised |
| --- | --- | --- |
| Right repo, right address | `exact` match | `live.test.ts`; production server, 5 s |
| Real repo, wrong address (both directions) | `no_match` | `live.test.ts`; production server, 32 s |
| Code changed after deployment | Default branch fails, exact match at the last commit before deployment | `oz.test.ts`; production server, 93 s |
| A budget too small to finish a real match | `inconclusive`, never `no_match` | `live.test.ts` |
| PolkaVM contract | `not_evm`, unsupported | `live.test.ts` |
| Address with no code | `no_code` | `live.test.ts` |
| Hostile archive paths (`..`, absolute) | Skipped, nothing written outside the work folder | `verify.test.ts`. Symlink and hard-link entries were also tried by hand, see [the audit](docs/AUDIT.md) |
| Source files built to stall the parser | Found by the audit, fixed, linear time now | [the audit](docs/AUDIT.md) |
| `ProofRegistry.record` with a wrong hash, a zero hash, a funded wallet with no code, or from a stranger | Reverts | `forge test` |
| Contract deployed from code that was never committed | Cannot match. Listed under limitations | n/a |

**A mismatch, a timeout and an outage are three different answers, and only a completed comparison can say "no".**

The registry's rule is enforced by the contract: it reads `EXTCODEHASH` of the target and reverts if it does not equal the hash passed in. That is the one hard guarantee on chain. Who is allowed to write is also enforced (`onlyAttester`), and that part is a trust choice, described next.

## What an on-chain record means

An on-chain record means OneScan's checker attested that the repo matches the contract. It is not trustless. OneScan holds the attester key. What the contract does enforce is that the recorded hash is the hash of code that is live at that address.

You do not have to trust it: every proof page lists the steps to repeat the check yourself with `git`, `solc` and one `eth_getCode` call.

## Testnet deployment

| Item | Value |
| --- | --- |
| Network | Portaldot V3 testnet, chain ID 420420777 |
| `ProofRegistry` address | `0x2a643655e0c8bc41d0f535462b266ad36237dda1` |
| Deployment tx hash | `0x657beae83fe86c825539a2ea7cce51f15876e69ddd19f543912721072539dd55` (block 291278) |
| Attester address | `0xDc474EfaBB69fAe76c5201A986a06CDA3A696d26` |

Tested on the live testnet by simulating `record` against the deployed contract: the real code hash from the attester is accepted, and a wrong hash, a zero hash, a funded wallet with no code, and a stranger's call all revert with the contract's own errors.

First record made by the running app: `Firzadf/nodescope` at `0xd48da7eff3264bdd51a86b873da9ff6997aae99c`, tx `0xa326887ff8493c4fb6b94bdc782f99f3cc1329f7e1ef4f8a15d46e05e10cf386`. The contract's stored hash equals the proof's runtime hash. Each record costs about 3.9 tPOT, so proofs made before the registry went live show no record until they are checked again.

## Limitations

- Sending tPOT to an 0x address was tested with SubWallet and real testnet tokens, and the balance rise was confirmed on-chain. Mapping was only run on an account that was already mapped, so a first-time map has not been tried with a real wallet.
- EVM bytecode only. Contracts built for PolkaVM, and ink! contracts, are not verified.
- A record on chain is OneScan's attestation, not a trustless proof. Anyone can reproduce the check.
- Git submodule dependencies are fetched at the commit the repo pins. If GitHub's API cannot be read for that pin (for example a rate limit), the fetch uses the latest code and a failed comparison is reported as unable to finish.
- A contract deployed from code that was never committed can never match.
- Contracts created by another contract (a factory) have no creation block or deployer shown, because the lookup finds direct deployments only.
- Public GitHub repos and Solidity only. Portaldot V3 testnet only.
- One check runs at a time. State lives in a local SQLite file on one server.
- A contract with no stored compiler version is tried with the version its repo names. A failure there is never a verdict, because the real version may be one that was not tried.
- Yul sources are not compiled.
- I have not measured adoption. Other teams' contracts were checked from their public repos; they have not been asked to use OneScan yet.

## Coverage

A read-only scan at block 284,796 found 132 contracts deployed directly on the EVM side of Portaldot V3 (successful contract-creation transactions; contracts created by other contracts are not counted).

I ran OneScan over 43 repo and contract pairs found in public Hacker House repos, through the public site, on a single-CPU server:

| Result | Count | Notes |
| --- | --- | --- |
| Matched | 40 | Public proof pages. Includes contracts built with metadata stripped, and contracts whose code changed after deployment |
| Does not match | 0 | The early engine reported 4. All 4 were real matches, missed because of untried settings or changed code, and led to the fixes below |
| No verdict | 3 | Two appear hand-written in Yul and one repo has no Solidity source. OneScan says so instead of guessing |

That leaves 42 public proofs across 32 repos, covering 32 of the 132 direct deployments. The live meter on the landing page shows the current count.

**What the false negatives changed.** "Does not match" is now earned only when every settings combination ran, the dependencies were the ones the repo pinned, and every source file was built. Anything less is reported as unable to finish, not as a verdict against the repo.

False claims were still refused after these changes: real repos checked against other teams' contracts never matched in any test run.

## Why Portaldot V3 needs this

V3 runs EVM contracts and PolkaVM contracts side by side on one chain. The deployed EVM code is plain solc output, so a repo can be checked against it directly, and the compiler version is stored in the bytecode itself. That is what makes a check with no uploads and no forms possible: the chain already says which compiler to use.

## Architecture

The module map and a diagram are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

| Module | Job |
| --- | --- |
| `src/lib/verify/index.ts` | Runs one check end to end and decides the verdict |
| `src/lib/verify/github.ts` | Resolves refs and downloads the repo archive safely |
| `src/lib/verify/imports.ts`, `graph.ts` | Reads imports, remappings, submodules, npm packages |
| `src/lib/verify/config.ts`, `pragma.ts` | Reads build settings and pragmas as text |
| `src/lib/verify/compiler.ts` | Downloads solc, checks its published hash, compiles in a worker |
| `src/lib/verify/metadata.ts` | Splits the metadata off bytecode and compares |
| `src/lib/jobs.ts`, `store.ts` | Serial queue and SQLite storage |
| `src/lib/chain.ts`, `native.ts`, `address.ts` | Chain reads and 5... to 0x address maths |
| `src/lib/attest.ts` | Writes the on-chain record (server only) |
| `contracts/ProofRegistry.sol` | Accepts a record only if it matches live code |

## Deploying

`next.config.ts` sets `output: "standalone"`. `npm run build` followed by `npm start` runs the production server; I ran both from a fresh clone and the server answered on its port. To deploy:

- Use Node 22.13 or later and give the process a writable folder for `DATA_DIR` and `ONESCAN_DATA_DIR`.
- Allow outbound HTTPS to the EVM RPC, `github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `api.github.com`, `cdn.jsdelivr.net` and `binaries.soliditylang.org`.
- Put it behind a reverse proxy that overwrites `X-Forwarded-For` with the real client address. The rate limit (10 checks per 10 minutes per client address) trusts the first entry of that header.
- Keep `.env.local`, `data/` and any key out of the repository. They are in `.gitignore`.

## Credits

Interface drawing kit: Stageshow by Benji Taylor (MIT). Copy was edited with the unslop process by Damir Sokolovsky (CC BY 4.0), https://github.com/heydamir/unslop. Everything third-party is listed in [NOTICE.md](NOTICE.md).

## License

MIT, see [LICENSE](LICENSE). Third-party licenses are in [NOTICE.md](NOTICE.md).
