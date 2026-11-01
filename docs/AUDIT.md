# OneScan audit

Internal report, written for the maintainers. Method: the project-audit process (claims first, then hygiene, then trying to break it). Date: 2026-11-02. State audited: commit `bd22954` plus uncommitted working-tree changes.

"Tested" means I ran it against a local `next dev` server or ran the function directly. "By reading" means I did not exercise it.

## 1. Wrong and matters

### F1. HIGH, fixed: three parsers stall the whole server on a crafted repo file

Regexes that backtrack quadratically ran on the main thread over files from a user-chosen repo:

| Parser | File | Trigger |
| --- | --- | --- |
| `parseImports` | `src/lib/verify/imports.ts` | `import import import ...` |
| `parsePragmas` | `src/lib/verify/pragma.ts` | `pragma solidity pragma solidity ...` |
| `parseHardhatConfig` | `src/lib/verify/config.ts` | `optimizer: {optimizer: {...` with no `}` |

Evidence (tested, direct calls): imports, 112 KB took 7.6 s and 256 KB took 45.8 s; pragma, 256 KB took 23 s; hardhat, 384 KB took 94 s. Time grows with the square of the size. The file limit is 2 MB, so one file means tens of minutes with the event loop blocked. A blocked loop also stops the timeouts that are meant to bound a check, and every route shares that process. Reach (by reading): anyone publishes a repo with such a file and posts it with any address that has EVM code with solc metadata. I could not publish a hostile repo, so the full HTTP path was not exercised.

Fix (small, in `src/`): `parseImports` is now a single linear pass; `parsePragmas` and `parseHardhatConfig` cut the text after the last `;` or `}` so every attempt has a terminator ahead. A 60,000-case differential fuzz against the old regexes found no difference in output. At 2 MB the slowest case now takes about 1.6 s. Regression tests: `src/lib/verify/parse-limits.test.ts` (4 tests); the imports test fails on the old code (45.8 s). `verify.test.ts` (32 tests) still passes.

### F2. MEDIUM: rate limit can be bypassed with `X-Forwarded-For`

`src/app/api/check/route.ts` keys on the first entry of `x-forwarded-for`. Tested: 10 requests with no header, the 11th got 429. Twelve requests with a different header value each all passed the limiter. Behind a proxy that overwrites the header this is not exploitable; behind one that appends, or when the app port is reachable directly, it is. Without the header all callers share one bucket named `local`, so one caller can lock out the rest. The limiter also counts invalid requests. Decision for the director: confirm the proxy overwrites the header, and consider taking the last trusted hop.

### F3. MEDIUM: one client can occupy the queue for hours

Checks run one at a time, up to 300 s each, 50 queued. 50 slow jobs is about 4 hours. With F2 open there is no per-client cap that holds. Also the `jobs` table is never pruned. Not load-tested, to avoid hammering GitHub and the testnet RPC.

### F4. MEDIUM: public read routes are unmetered and each calls upstream services

| Route | Work per request |
| --- | --- |
| `GET /api/proof/[address]` | live `eth_getCode`, a full-range `eth_getLogs`, and (first time) about 20 sequential `eth_getCode` calls |
| `GET /badge/[address]` | one `eth_getCode` |
| `GET /api/address/[address]` | EVM RPC plus Substrate WebSocket reads |
| `GET /api/preflight/[address]` (new) | one `eth_getCode` |
| `GET /api/pulse` (new) | block number (cached 4 s), and it parses every stored proof, source included, on each call |

Tested: `/api/proof` for a stored proof took 0.7 to 10 s under load. A flood would hit the public testnet RPC from the server's address, and `/api/pulse` gets slower as proofs accumulate. Badges are embedded on third-party pages by design, so some load is normal.

### F5. MEDIUM (policy): a hosting alias is in public git history

The string was added in `4015e2a` and removed in `8bed223`, and `origin/main` contains both. It is a name, not a credential. Removing it needs a history rewrite and a force push, which is the director's call. The current tree and `director.md` do not contain it. The secret scan found nothing else (section 3).

### F6. LOW: no security headers

Tested with `curl -I` on `/`: no `Content-Security-Policy`, `X-Frame-Options` or `frame-ancestors`, `X-Content-Type-Options` or `Referrer-Policy`. The Fund panel could be framed by another site. A wallet prompt would still show the transaction, so impact is low. Add them in the proxy or `next.config.ts` (not changed by me).

### F7. LOW: the solc binary is run on trust from one origin

`compiler.ts` loads the downloaded `soljson-*.js` into a worker thread that has full Node access. The sha256 comes from `list.json` on the same host, and the check is skipped when the list has no hash for a build. It stops corruption, not a compromised host. Worker heap is capped at 2 GB, which is a lot on a shared server (peak measured by the director: 439 MB for a large project; a hostile contract was not tried).

### F8. LOW: outbound hosts are more than the two the design names

User input never chooses a host. Hosts reached: `github.com`, `codeload.github.com`, `raw.githubusercontent.com`, `api.github.com`, `cdn.jsdelivr.net`, `binaries.soliditylang.org`, and the configured RPC. Details:

- A submodule `branch` from `.gitmodules` may contain `..` (tested): `lib/x/a.sol` became `https://raw.githubusercontent.com/o/r/../../../evil/a.sol`, which resolves to another path on the same host. Not SSRF, but the ref is not confined to one segment.
- npm sub-paths accept `?`, `#` and `%2e%2e` (tested) on the jsDelivr host.
- The archive redirect host is checked after the redirect is followed (`github.ts`).
- `fetchTextOrNull` reads the whole body before applying its 5 MB cap.

### F9. LOW: no request body limit on `POST /api/check`

A 3 MB body was read and parsed, then answered 400 (tested). Not a 413.

### F10. LOW: `npm test` double-runs when `.next/standalone` exists

Build output contains copies of every test. Tested: the per-file runs reported two files each, and the two copies of `attest.test.ts` collided on one port, so one failed. A clean clone is fine (9 files, 70 tests passed before my test file was added). A `vitest.config` that excludes `.next` would fix it; it is outside what I may change. The same folder holds `data/onescan.db`, a copy of the local database, so do not copy `.next/standalone` to a server whole.

### F11. LOW: dependency advisories

`npm audit`: 18 findings (16 moderate, 2 high). The two high ones are `tmp` pulled in by `solc` (path traversal through its prefix/template arguments). By reading, OneScan never calls `tmp`; the suggested fix downgrades `solc`. Not changed.

### F12. LOW: two data-folder variables

`DATA_DIR` (database) and `ONESCAN_DATA_DIR` (compiler cache) are separate. Setting only one splits state. Documented in the README.

### F13. Repository facts for the submission

- No `LICENSE` file at the repository root. The README says so.
- All 13 commits are dated 2026-11-01 to 2026-11-02. The event wants 3 or more commits and core modules not all in the final day; the director should check that rule against this history.
- `director.md` is tracked and public.

## 2. Wrong and does not matter much

- The three keys in the history are Foundry's public anvil keys, used only by local tests. Anything sent to them on a real chain would be taken by others.
- Error text from an unexpected exception is returned in a job's `failure.detail` and shown in the UI. I could not trigger one that carries a server path, so this is by reading only.
- `ProofRegistry.record` lets the attester overwrite an earlier record for the same target. Intended; the test `test_ReRecordingUpdates` covers it.

## 3. Verified

| Check | Result | How |
| --- | --- | --- |
| Secret scan of all history (`git log --all -p`, 13 commits) | No private-key headers, token shapes, `.env`, `.pem`, database or private-notes file ever tracked. Four 64-hex strings: three are anvil keys, one is a transaction hash | tested |
| `.gitignore` | Covers `.env*` (checked `.env.local`, `.env.production`), `/data`, `/director.private.md`, `/contracts/out` | `git check-ignore` |
| Private key in the browser bundle | No match for `ATTESTER_PRIVATE_KEY`, `privateKeyToAccount`, `REGISTRY_ADDRESS`, `DEPLOYER_PRIVATE_KEY` or `writeContract` in 39 files of `.next/static` and 243 of `.next/dev/static`. Client components import only types and `lib/address.ts`. Only `NEXT_PUBLIC_NATIVE_WS_URL` and `NEXT_PUBLIC_REPO_URL` are public | tested, plus reading |
| Repo input | `https://evil.com/..`, `http://`, userinfo URL, `..`, query strings, newlines, arrays, numbers: all 400 | tested |
| Commit input | `a..b`, `--upload-pack=x`, `../../x`, 200 characters: all 400 | tested |
| Address input | Non-0x, markup, `%ZZ`: 400 | tested |
| Tar extraction | `..`, absolute, drive-letter, symlink and hard-link entries wrote nothing outside the work folder; files over 2 MB are reported as skipped; `node_modules` skipped | tested with a hand-built archive |
| XSS | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in app code. Repo, file, contract and error strings render as React text. The badge uses fixed strings plus a validated address. A stored proof with `<img onerror>` in file, contract and source came back from the API as inert JSON | reading, grep, API round trip. Not confirmed in a rendered page: the shared browser pane was navigated elsewhere by another party and the dev page never hydrated |
| Other users' data | No accounts. Job ids are random UUIDs. Proofs are public by design. `/api/proofs` omits source and ABI | reading, tested |
| Nothing from a repo is executed | Config is parsed as text; the only dynamic load is the solc wrapper in the worker | grep for `child_process`, `exec`, `vm` |
| Type check and lint | `tsc --noEmit` and `eslint` exit 0 | tested |
| Tests | 10 files, 74 tests passed (389 s); `forge test` 8 passed (cached build) | tested |
| `npm run build` then `npm start` | Build exit 0, server answered 200, from a fresh clone | tested |
| Repo size | `.git` 1.5 MB; no large blobs in history | tested |

## 4. Not verified

- The public URL: not reachable from the audit machine at the time of the check.
- Timings (5 s, 21 s, 93 s) and the PolkaVM and `EXTCODEHASH` results come from the director's production measurements, not from my runs.
- The Fund panel, any on-chain record on Portaldot, and the registry on a live network. The registry is only tested on a local chain.
- F1 end to end through HTTP, hostile-contract memory use, and queue flooding.
- Rendered-page XSS (see section 3).
- Files I did not read line by line: the Stageshow kit (third-party), `graph.ts` internals, the UI components other than those grepped.

## 5. What this audit changed

Only these files under `src/`: `src/lib/verify/imports.ts`, `pragma.ts`, `config.ts` (F1) and the new `src/lib/verify/parse-limits.test.ts`. Documentation: `README.md`, `NOTICE.md`, `docs/ARCHITECTURE.md`, `docs/API.md` (added `/api/pulse` and `/api/preflight/[address]`), and this file. Nothing was committed.
