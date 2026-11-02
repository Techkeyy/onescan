# OneScan audit

Date: 2026-11-02. Method: every factual claim in the documentation was treated as a test, then the repository was checked, then I tried to break the running app.

"Tested" means I ran it. "By reading" means I did not exercise it. Production means the live server.

## 1. Open, and worth knowing

### Queue can be occupied by one client (medium)

Checks run one at a time, up to 300 s each, with 50 queued. The rate limit of 10 checks per 10 minutes per client slows this but does not stop someone using many addresses. Finished jobs are also never pruned. Not load-tested, to avoid hammering GitHub and the public testnet RPC.

### Public read routes are not rate limited (medium)

`/api/proof`, `/badge`, `/api/address` and `/api/preflight` each call the chain, and `/api/pulse` parses every stored proof, with its chain read cached for 4 s. A flood would reach the public testnet RPC from the server's address. Badges are embedded on other sites by design, so some load is expected.

### The compiler binary is trusted from one origin (low)

`compiler.ts` runs the downloaded `soljson` in a worker with full Node access. Its sha256 comes from a list on the same host, and the check is skipped if the list has no hash for a build. This stops corruption, not a compromised host.

### Dependency advisories (low)

`npm audit` reports 18 advisories, 16 moderate and 2 high, all in dependency trees. The two high ones are `tmp`, pulled in by `solc`, through arguments OneScan never passes (by reading). The suggested fix downgrades `solc`, so it was not applied.

### Outbound URLs from repo metadata (low)

User input never chooses a host. A submodule `branch` containing `..` can change the path on `raw.githubusercontent.com`, and npm sub-paths can carry `?` and `%2e%2e` on jsDelivr (tested). Both stay on the same host, so this is not server-side request forgery.

### Rate limit depends on the proxy (low, by design)

The limit trusts the first `X-Forwarded-For` entry, so the app must sit behind a proxy that overwrites it. Production does. The public address is a Vercel front door that names the visitor, and the server believes that name only with a shared secret. Faked headers still hit the limit through the front door and directly at the server, and a second visitor was unaffected when the first was limited (tested). The README states this requirement for anyone deploying it.

## 2. Found and fixed

| Finding | Severity | Fix | Evidence |
| --- | --- | --- | --- |
| Three parsers could stall the server on a crafted repo file. A 384 KB file took 94 s, and the file limit is 2 MB | High | Linear parsing. The slowest case at 2 MB is about 1.6 s, and a 60,000-case comparison with the old parsers found no change in output | `parse-limits.test.ts` |
| All 4 early refusals on real contracts were false negatives | High | `no_match` now requires every setting, the pinned dependencies and every source file | `live`, `pins`, `oz` tests; 0 false `no_match` on 43 real pairs |
| The wallet panel lost its result when the balances refreshed, so a successful send looked failed | Medium | The page stays mounted through a refresh | Browser test, then a real wallet |
| The wallet panel gave up on the node after 12 s, but connections take 4 to 14 s, so it reported false outages | Medium | One shared connection, 45 s limit | Measured 5 connections; real wallet |
| No security headers | Low | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | `curl -I` on production |
| No body limit on `POST /api/check` | Low | Over 4 KB is answered 413 | Tested on a clean copy |
| `npm test` ran tests twice when build output existed | Low | `.next` excluded in `vitest.config.ts` | 14 files reported after a build |
| README timing and test counts had gone stale | Low | Rewritten from today's runs | This audit |
| The account page was hard to find from the landing page | UX | Landing section and an Accounts link | Reported by a real user |

## 3. Noted, not a problem

- The three private keys in `attest.test.ts` are Foundry's public `anvil` keys, used on a local chain only.
- `ProofRegistry.record` lets the attester overwrite an earlier record for the same target. This is intended and covered by `test_ReRecordingUpdates`.
- Re-checking a contract that already has a record keeps that record and spends nothing. Tested: 2 recorded proofs re-checked, balance and record count unchanged.
- A short server alias from early setup is in old commits. It is a name, not a credential, and it was removed from the current files.

## 4. Verified

| Check | Result | How |
| --- | --- | --- |
| Secrets in all history | The attester key and API keys appear in no commit. No key shapes, `.env` files or databases were ever tracked | Tested, searched by exact value and by pattern |
| Private key in the browser bundle | Client code imports only types and `address.ts`. Only two `NEXT_PUBLIC_` values are exposed | Tested at an earlier commit, plus reading |
| Clean copy of the tracked files | `npm ci`, `npm run build`, `npm start` work, and the README's `curl` check returned `matched` | Tested |
| Tests | 14 files, 106 of 106 passed in about 10 minutes, of which 84 are the check engine. `forge test` 8 of 8 | Tested on the clean copy |
| Lint | `eslint` reports no errors or warnings | Tested |
| Documented checks on production | `exact` in 3 s, refusal in 34 s, look-back in 173 s, PolkaVM, no code and missing repo all correct | Tested |
| Registry on the live testnet | Right hash accepted; wrong hash, zero hash, wallet and stranger revert | Simulated against the deployed contract |
| 5 on-chain records | Each stored hash equals the hash of the live code | Read from the chain |
| Sending tPOT with a real wallet | 5 and 1 tPOT moved, exact amounts confirmed on-chain | Tested with SubWallet |
| Repo input | URLs to other hosts, `..`, query strings and newlines answer 400 | Tested at an earlier commit |
| Archive extraction | `..`, absolute, symlink and hard-link entries write nothing outside the work folder | Tested with a hand-built archive |
| Nothing from a repo is executed | Config is parsed as text, and the only dynamic load is the compiler | Reading and search |
| XSS | No `dangerouslySetInnerHTML`, `eval` or `new Function` in app code, outside the third-party kit | Reading and search |
| Reduced motion, phone width, light mode | No sideways overflow on 5 page types, and nothing animates under reduced motion | Tested in a real browser |
| Public address end to end | Match, refusal, the 3-minute look-back, proofs, badge and account page all pass through the front door, with no page errors | Tested in a real browser |
| Links in the README | Every link answered 200 | Tested |

## 5. Not verified

- A first-time `mapAccount` with a real wallet. The test account was already mapped.
- A wallet send through the Vercel address. It was tested on the server's own address, and the wallet talks directly to the Portaldot node.
- Behaviour under a real flood, and memory use on a hostile contract.
- The parser fix through the full HTTP path, because it would need publishing a hostile repo.
- The third-party Stageshow kit was not read line by line.
- Rendered-page XSS with a hostile stored proof was tested through the API only.
