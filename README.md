# OneScan

Paste a GitHub repo and a Portaldot V3 contract address. OneScan rebuilds the code and tells you whether it is what is really running.

**[Live app](https://onescan-portaldot.vercel.app)** · **[Demo video](https://youtu.be/JsZpk6Ul9JA)** · **[Watch it refuse a false claim](https://onescan-portaldot.vercel.app/check?repo=Gieez/portaldot-revivescope&address=0xd48da7eff3264bdd51a86b873da9ff6997aae99c&run=1)** · **[A real proof](https://onescan-portaldot.vercel.app/proof/0xd48da7eff3264bdd51a86b873da9ff6997aae99c)** · [All proofs](https://onescan-portaldot.vercel.app/proofs) · [API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Audit](docs/AUDIT.md)

For builders who want to prove a contract, and for judges, integrators and users who want to check someone else's. No wallet, no account.

> *"This repo says it is the contract at that address. Is it?"*

[![OneScan badge, read live from the chain](https://onescan-portaldot.vercel.app/badge/0xd48da7eff3264bdd51a86b873da9ff6997aae99c)](https://onescan-portaldot.vercel.app/proof/0xd48da7eff3264bdd51a86b873da9ff6997aae99c)

<sub>Built for Portaldot Hacker House 2026, track Node Operations & Tooling.</sub>

## Why this exists

On Portaldot V3, anyone can put a GitHub link next to a contract address. The chain stores only compiled bytes, so nothing shows that the repo is the code that is running. A judge, an integrator and a user all have to take it on trust.

Sourcify and Etherscan solve this on other chains. In my GitHub searches I found nothing doing it for Portaldot V3 EVM contracts, which is the gap OneScan fills. It is not an explorer: for blocks and transactions, use [Pindex](https://github.com/youthisguy/portalIndex) or the [node console](https://node-console.portaldot.dev/). OneScan answers one question.

```
   repo + commit                                  contract address
        |                                                |
   compile with the exact                        eth_getCode on the
   solc version the chain's                      Portaldot V3 EVM RPC
   bytecode names in its metadata                        |
        |                                                |
        +---- strip metadata, mask immutables -----------+
                              |
                  same?  yes: public proof, badge, on-chain record
                         no:  refused, never listed
```

## What it does

1. **Reads** the code at the address with `eth_getCode`. Empty code and PolkaVM code are reported as such, not verified.
2. **Reads** the solc version from the CBOR metadata at the end of the bytecode.
3. **Fetches** the repo at one exact commit, extracting only Solidity and build config files.
4. **Resolves** imports from the repo, git submodules and npm packages. Build config is read as text. **Nothing from the repo is ever executed.**
5. **Compiles** with that exact solc release in a worker thread with a timeout, trying the repo's own settings first and then a ladder of common ones.
6. **Compares** runtime bytecode with immutables masked. Identical including the metadata hash is an `exact` match. Identical apart from metadata is a `code` match.
7. **Looks back** to the repo's last commit before deployment when the branch you gave no longer matches, because repos move on after they deploy.
8. **Publishes** a match as a proof page and a README badge. Both compare the stored hash with the live code again each time they are opened, and the badge stops saying it matches if the code changes.
9. **Records** the match on the `ProofRegistry` contract, which reverts unless the target's `EXTCODEHASH` equals the recorded hash.

## Try it

Open the [check page](https://onescan-portaldot.vercel.app/check) and paste any of these. Times were measured on the production server, a single CPU, in November 2026.

| Repo | Address | What you should see | Time |
| --- | --- | --- | --- |
| `Firzadf/nodescope` | `0xd48da7eff3264bdd51a86b873da9ff6997aae99c` | Exact match | 3 s |
| `Gieez/portaldot-revivescope` | `0xd48da7eff3264bdd51a86b873da9ff6997aae99c` | Refused: a real repo that compiles, but is not this contract. Every setting runs before it says no | 34 s |
| `Rohitamalraj/DotProof` | `0x7e3444c1f9dbd53dea5ebc8160522b154857566b` | Fails on the default branch, then matches at the last commit before deployment | 173 s |
| `Firzadf/nodescope` | `0xeebc363c7af7ed8e888da07e959043517ae4b97d` | PolkaVM contract: unsupported, not guessed at | under 1 s |

These are other builders' public repos, used as test inputs.

From a terminal:

```bash
curl -X POST https://onescan-portaldot.vercel.app/api/check \
  -H 'content-type: application/json' \
  -d '{"repo":"Firzadf/nodescope","address":"0xd48da7eff3264bdd51a86b873da9ff6997aae99c"}'
# {"id":"..."}  then poll GET /api/check/<id> until state is matched, no_match or failed
```

## Why a refusal is the feature

A verifier that says "yes" is easy to build. OneScan is built around when it is allowed to say no.

**A mismatch, a timeout and an outage are three different answers, and only a completed comparison can say "no".** "Does not match" requires that every settings combination ran, on the dependencies the repo pinned, with every source file built. Anything less is reported as unable to finish, never as a verdict against the repo.

I learned this the hard way. The first engine refused 4 pairs in real testing, and all 4 were real matches, missed because of untried settings or code changed after deployment. Those false negatives are why the rule exists.

## How I tried to break it

| Input | Result | Where it is exercised |
| --- | --- | --- |
| Right repo, right address | `exact` match | `live.test.ts`; production |
| Real repo, wrong address, both directions | `no_match` | `live.test.ts`; production |
| Code changed after deployment | Fails on the branch, matches at the last commit before deployment | `oz.test.ts`; production |
| Metadata stripped from the deployed code | `code` match using the compiler the repo names, or unable to finish, never `no_match` | `nometa.test.ts`, `nometa-unit.test.ts` |
| Budget too small to finish a real match | `inconclusive`, never `no_match` | `live.test.ts` |
| PolkaVM contract | `not_evm`, unsupported | `live.test.ts`; production |
| Address with no code, or a funded wallet | `no_code` | `live.test.ts`; production |
| Repo that does not exist | `repo_not_found` | production |
| Hostile archive paths (`..`, absolute) | Skipped, nothing written outside the work folder | `verify.test.ts` |
| Source files built to stall the parser | Found in my audit, fixed, linear time now | `parse-limits.test.ts` |
| Faked visitor headers to dodge the rate limit | Still limited, through the front door and directly at the server | `util.test.ts`; production |
| `ProofRegistry.record` with a wrong hash, a zero hash, a wallet with no code, or from a stranger | Reverts with the contract's own error | `forge test`; deployed contract, simulated |
| Contract deployed from code that was never committed | Cannot match. Listed under limitations | n/a |

Real repos checked against other teams' contracts never matched in any test run.

## Results on real contracts

A read-only scan at block 284,796 found 132 contracts deployed directly on the EVM side of Portaldot V3. I ran OneScan over 43 repo and contract pairs found in public Hacker House repos, through the public site. They are listed in [docs/coverage-candidates.json](docs/coverage-candidates.json), where two addresses appear twice because two repos name them.

| Result | Count | Notes |
| --- | --- | --- |
| Matched | 40 | Public proof pages |
| Does not match | 0 | No pair in the list was a false claim. Refusals are tested separately, above |
| No verdict | 3 | Two appear hand-written in Yul and one repo has no Solidity. OneScan says so instead of guessing |

With 2 proofs from earlier test runs, that makes 42 public proofs across 32 repos, covering 32 of the 132 direct deployments. The landing page shows the live count. I have not measured adoption: these contracts were checked from public repos, and their teams have not been asked to use OneScan yet.

## On Portaldot

| Item | Value |
| --- | --- |
| Network | Portaldot V3 testnet, chain ID 420420777 |
| `ProofRegistry` | `0x2a643655e0c8bc41d0f535462b266ad36237dda1` |
| Deployment | `0x657beae83fe86c825539a2ea7cce51f15876e69ddd19f543912721072539dd55`, block 291278 |
| Attester | `0xDc474EfaBB69fAe76c5201A986a06CDA3A696d26` |

Five real projects are recorded so far, each with its stored hash checked against the live code. The first is `Firzadf/nodescope`, transaction `0xa326887ff8493c4fb6b94bdc782f99f3cc1329f7e1ef4f8a15d46e05e10cf386`. The others are `Anshv784/potdrive`, `Rohitamalraj/DotProof`, `a252937166/ReviveCheck` and `lazydevpro/reachpot`. A record costs about 3.9 tPOT, so the other 37 proofs show none until they are checked again.

**What a record means.** OneScan's checker attested that the repo matches the contract. It is not trustless, because OneScan holds the attester key. The contract enforces two things: only the attester can write, and a record can only point at code that is live. You do not have to trust it: every proof page lists the steps to repeat the check with `git`, `solc` and one `eth_getCode` call.

### Account page

Portaldot gives one account two addresses, and that confused me as a user too. [Look up any address](https://onescan-portaldot.vercel.app/#accounts) to see both forms and both balances. From there, your own wallet can **map** a 5... account so its balance works with 0x tools, or **send** tPOT to a MetaMask address. OneScan never sees a key.

### What I learned building on V3

- A 0x account's 5... form is the address followed by twelve `0xEE` bytes. A 5... account's 0x form is the last 20 bytes of its keccak hash.
- After `revive.mapAccount`, the native balance is usable as the 0x balance, minus the 0.1 tPOT existential deposit. I checked this on-chain.
- MetaMask cannot sign for a mapped address, because its key is the 5... wallet.
- tPOT has 14 decimals natively and 18 on the EVM RPC.
- Deployments are expensive: `ProofRegistry`, at 1,530 bytes of code, cost about 133 tPOT. 8 of the 43 pairs had metadata stripped from their code, and I suspect cost is why, though that is an inference.

## Limitations

- EVM bytecode from Solidity only. PolkaVM, ink! and Yul sources are not checked.
- Public GitHub repos on the Portaldot V3 testnet only.
- A match says the code is what the repo shows. **It is not an audit**, and it does not say the code is safe.
- A contract deployed from code that was never committed can never match.
- A contract with no stored compiler version is tried with the version its repo names. A failure there is never a verdict.
- If GitHub's API cannot read a submodule pin, the fetch uses the latest code, and a failed comparison is reported as unable to finish.
- Contracts created by a factory show no creation block or deployer.
- Sending tPOT was tested with SubWallet and real testnet tokens, and confirmed on-chain. Mapping has only run on an account that was already mapped, so a first-time map has not been tried with a real wallet.
- One check runs at a time, on one server, with state in a local SQLite file.

## Run it locally

Needs Node 22.13 or later and network access to the Portaldot RPC, GitHub and the Solidity compiler binaries. No environment variable is required.

```bash
npm install
npm run dev     # http://localhost:3000
```

Then check it answers, and run a real check against it:

```bash
curl http://localhost:3000/api/pulse
curl -X POST http://localhost:3000/api/check \
  -H 'content-type: application/json' \
  -d '{"repo":"Firzadf/nodescope","address":"0xd48da7eff3264bdd51a86b873da9ff6997aae99c"}'
```

| Tests | Command | Result |
| --- | --- | --- |
| Quick, no network | `npx vitest run src/lib/address src/lib/verify/pins-unit src/lib/verify/parse-limits src/lib/store src/app/api/_lib` | 24 tests, about 10 s |
| Everything | `npm test` | 14 files, 106 tests passed, about 10 minutes. 84 are the check engine, some running live against the real chain, GitHub and compiler |
| Contract | `forge test` in `contracts/` | 8 tests passed |

`attest.test.ts` starts a local `anvil`, so the full run needs [Foundry](https://getfoundry.sh) on your PATH. It never contacts Portaldot. These results come from a clean copy of this repository.

<details>
<summary>Optional settings</summary>

| Variable | Used for | Default |
| --- | --- | --- |
| `EVM_RPC_URL` | EVM JSON-RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| `NATIVE_WS_URL` | Substrate node for the account page | `wss://test-node-v3.portaldot.dev` |
| `NEXT_PUBLIC_NATIVE_WS_URL` | Same, for the wallet tools in the browser | same as above |
| `DATA_DIR` | SQLite database | `./data` |
| `ONESCAN_DATA_DIR` | Compiler cache. Set it to the same folder as `DATA_DIR` | `./data` |
| `GITHUB_TOKEN` | Raises the GitHub API limit for the look-back | unset |
| `ONESCAN_VERIFY_BUDGET_MS` | Total time for one check | 300000 |
| `ONESCAN_COMPILE_TIMEOUT_MS` | Time for one compile | 120000 |
| `REGISTRY_ADDRESS`, `ATTESTER_PRIVATE_KEY` | Together enable on-chain records. Server only, in `.env.local` | unset: no records |
| `NEXT_PUBLIC_REPO_URL` | Adds a source link to the footer | unset |
| `ONESCAN_PROXY_SECRET` | Shared with the front door, so it can name the visitor | unset: `X-Forwarded-For` only |

`node scripts/new-attester.mjs` makes an attester key and prints only the address. `scripts/deploy-registry.mjs` is a dry run unless you pass `--send`.

To deploy, run `npm run build` and `npm start` behind a reverse proxy that overwrites `X-Forwarded-For`, because the rate limit of 10 checks per 10 minutes trusts that header. The public address is a free Vercel front door ([deploy/vercel](deploy/vercel)) that passes every request to one server. It names the visitor to the rate limit, and the server believes it only with `ONESCAN_PROXY_SECRET`. Allow outbound HTTPS to the RPC, `github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `api.github.com`, `cdn.jsdelivr.net` and `binaries.soliditylang.org`.

</details>

## Architecture

The diagram and full module map are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Module | Job |
| --- | --- |
| `src/lib/verify/index.ts` | Runs one check and decides the verdict |
| `src/lib/verify/github.ts` | Resolves refs, downloads the archive within limits |
| `src/lib/verify/imports.ts`, `graph.ts` | Finds imports, remappings, submodules, npm sources |
| `src/lib/verify/config.ts`, `pragma.ts` | Reads build settings as text, never runs them |
| `src/lib/verify/compiler.ts` | Fetches solc, checks its published hash, compiles in a worker |
| `src/lib/verify/metadata.ts` | Splits metadata off bytecode and compares |
| `src/lib/jobs.ts`, `store.ts` | Serial queue and SQLite storage |
| `src/lib/chain.ts`, `native.ts`, `address.ts` | Chain reads and address conversion |
| `src/lib/attest.ts` | Writes the on-chain record, server only |
| `contracts/ProofRegistry.sol` | Accepts a record only if it matches live code |

## Credits

The home page illustration uses Stageshow by Benji Taylor (MIT). Interface copy was edited with the [unslop](https://github.com/heydamir/unslop) process by Damir Sokolovsky (CC BY 4.0). Everything third-party is listed in [NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE)
