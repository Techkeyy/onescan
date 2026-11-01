# OneScan director log

Handover document. Another director must be able to take over from this file alone.
Governing standard: `C:\Users\HomePC\Desktop\skill\master director skill.txt`.
Idea research: `C:\Users\HomePC\Desktop\skill\idea-research\portaldot-hacker-house-idea-research.md`
(its Twinscan recommendation is superseded by the decision below).

## Authoritative status

**BUILDING: INTEGRATION PROVEN on the production server through a private tunnel. Not public, no on-chain record, no owner UAT.**

Update this line after every phase. Allowed words: BUILDING, COMPONENT PROVEN,
INTEGRATION PROVEN, UAT READY, UAT PASS, RELEASE READY, SUBMISSION READY, FINISHED.

## Event facts

- Portaldot Hacker House 2026 on DoraHacks, solo builder (GitHub: Techkeyy).
- **Final submission and code freeze: 2026-11-06 04:00 UTC.** Target finish: 2026-11-02.
- Track 3, Node Operations & Tooling. Organizer (Stella707827) confirmed late entry and that a verification/explorer tool "counts as a node tool".
- Rubric: Technical 30, Innovation 30, Ecosystem 20, Business 20. Judged on GitHub history, testnet records, contract addresses, tx hashes, live demo.
- Must submit: public repo (README, deploy instructions, docs, runnable code, testnet info), runnable demo, video 3 min max, pitch deck, contract address + tx hash.
- Repo needs 3+ commits in the period; core modules must not all land in the last 24h; disclose third-party dependencies.
- Testnet: EVM RPC `https://test-evm-rpc-v3.portaldot.dev`, chain ID 420420777. Substrate `wss://test-node-v3.portaldot.dev`. Console `https://node-console.portaldot.dev/`. Token tPOT, 14 decimals native, 18 on the EVM RPC.

## Decision: why OneScan is a proof tool, not an explorer

Our original idea was an explorer plus address twin. GitHub search on 2026-11-01 showed that is taken: **Pindex** (youthisguy/portalIndex, since Oct 15) has dual search, tx lookup and SS58/H160 mapping. **ReviveScope** (Gieez/portaldot-revivescope) has an address resolver. Rebuilding those is a beauty contest two weeks behind.

Whitespace: no public repo found (limited searches, not proof) checks that a GitHub repo is what is deployed. Judges here score exactly that evidence. Do **not** claim "first" or "only" anywhere; say "built for Portaldot".

## Product

- **Intended user:** a builder proving their contract, and a judge, integrator or user checking someone else's.
- **Problem:** on Portaldot V3 anyone can link a repo next to a contract address, and nothing shows that the code in the repo is the code running on-chain.
- **Promise:** paste a public GitHub repo and a contract address, and get a checkable answer.
- **Core Outcome:** *This product is only genuinely working when anyone, with no account, wallet or setup, can paste a public repo and a Portaldot contract address and get a correct verdict: it confirms a real match, refuses a false one, and leaves a public proof page and an on-chain record that a sceptic can recheck without trusting OneScan.*

### Real user journey (primary acceptance test)

1. Open OneScan. See two inputs: GitHub repo, contract address.
2. Press **Check**. See real stages: reading bytecode, reading compiler version, fetching repo at a commit, compiling, comparing.
3. Land on `/proof/<address>` with a verdict naming the matched file, contract, commit (linked), compiler and settings.
4. See who deployed it, the creation block and tx, and recent on-chain activity.
5. See the on-chain record tx from ProofRegistry, or a truthful "record pending".
6. Copy a share link and a README badge. Anyone opening it sees the same proof, re-checked against live bytecode.
7. Optional: `/proofs` lists matched proofs. Failed checks are never listed publicly.

### Scope

- **NOW (core):** verify engine, proof page, API, ProofRegistry, attester, badge, proofs list.
- **SUPPORTING:** `/address/<5… or 0x…>` twin card with both balances; **Fund my EVM address** via the user's Substrate wallet.
- **LATER (README only):** PolkaVM and ink! verification, tx page, decoded event browser, CI action, private repos.
- **DISTRACTION, do not build:** full chain indexer, block lists, node monitoring, token pages, accounts or login.

## Proven facts (live chain, 2026-11-01)

| Fact | Evidence |
| --- | --- |
| Runtime is pallet-revive + pallet-contracts | Metadata pallets `Revive`, `Contracts`; client `eth-rpc/main-fddd431` |
| Deployed EVM code is plain solc output | `eth_getCode` starts `0x6080…`; a PolkaVM contract starts `0x50564d00`; show that as unsupported |
| **Repo to bytecode works** | Firzadf/nodescope `0xd48da7eff3264bdd51a86b873da9ff6997aae99c` and Gieez/portaldot-revivescope `0xe0ba8adf0cd660f5875aca70a98e466f30855dec` both matched on metadata-stripped code, optimizer 200, under 7s, solc version read from CBOR metadata. Both are PARTIAL (metadata hash differs) |
| Creation lookup needs no indexer | Binary search on historical `eth_getCode` then scan that block: block 216268, tx `0x1c2a0555…4f5904` for nodescope, matching their README |
| RPC capacity | JSON-RPC batch works; `eth_getLogs` over the full range about 1s; receipt about 350ms; `debug_traceTransaction` works |
| 0x to 5… | H160 + twelve `0xEE` bytes. Sender `0x5869…6c44` -> `5E4dS2av…BmyBR`: native 49.0624 tPOT, EVM 48.9624 (difference 0.1, assumed to be the existential deposit: **unverified**) |
| 5… to 0x | last 20 bytes of keccak256(AccountId32). Confirmed by `reviveApi.address` |
| Fund route | Native transfer to `H160 ++ EE*12` should credit the MetaMask account. **Inferred, not yet observed: needs tPOT** |
| Trap | Sending EVM value to the keccak H160 of an unmapped 5… account is expected to land on a fallback account, not the 5… account. **Unverified; do not build a reverse transfer** |
| Deploy cost | NodeScope measured a deploy at 124 tPOT on EVM (mostly refundable deposit). **Budget tokens before deploying** |

Reference wallet (owner's, public): `5DcritAN6VxWuzBKX7VoLqy8yotyyCA1AX1cSpH63So9tm8z`, H160 `0x71da9ed9cebfaf7c8719667180fc8978db3be821`. Balance 0 on 2026-11-01; tPOT requested from organizer.

## Claim -> mechanism -> proof ledger

| Claim | Mechanism | Boundary | Required proof | Status |
| --- | --- | --- | --- | --- |
| Match means the repo's code is what runs | Compile at pinned commit, compare runtime bytecode with metadata stripped and immutables masked | Server, independently reproducible | Real contracts match through the deployed UI | Spike only |
| False repos are refused | Same comparison | Server | Wrong repo returns no match on deployed UI | UNPROVEN |
| Exact vs code match is honest | Compare metadata hash separately | Server | Both labels shown correctly | UNPROVEN |
| Proof is re-checked live | Page compares stored hash with current `eth_getCode` | Server + chain | Changed code shows as changed (unit-level) | UNPROVEN |
| On-chain record matches real code | Registry reverts unless `target.codehash == runtimeHash` | **Contract, HARD** | Wrong hash reverts on testnet | UNPROVEN |
| Only the attester writes | `onlyAttester` | **Contract, HARD** | Non-attester reverts on testnet | UNPROVEN |
| Attestation means OneScan's server checked it | Attester key | SOFT, say so plainly | Stated in UI and README | Planned wording |
| Fund moves real tPOT | User signs native transfer | User's wallet + chain | Owner's UAT: balance changes on 0x | UNPROVEN, needs tPOT |

## Engineering rules

- Next.js App Router, one process, `node:sqlite`. Live chain reads; no indexer. No mocks in the product.
- Simple over clever. No login. Never evaluate code from a repo: parse only, compile in solc wasm.
- Secrets only in env, never committed. Attester key is server-only.
- UI copy in user terms. No long dashes in UI copy.
- Sub-agents never commit, never deploy, never run transactions. The director reviews evidence and commits.

## Open blockers

1. tPOT not received. Blocks registry deployment and Fund UAT.
2. Production host: owner approved a shared VPS on the condition that other services there are not disturbed. Operating details are in the gitignored `director.private.md`, which must stay out of the public repo.

## Log

- 2026-11-01: research, feasibility spike, pivot to proof tool, scaffold.
- 2026-11-01: public repo https://github.com/Techkeyy/onescan created. Registry: COMPONENT PROVEN on local anvil only; added a code-length check after a failing test proved a funded wallet could be recorded. Backend committed; its 16 tests reproduced by the director.
- 2026-11-01 OPEN: through the real API the false claim (revivescope repo vs nodescope address) ended compile_failed after a 100s timeout, not no_match. Sent to the engine builder. Core Outcome blocker until fixed.
- 2026-11-01: engine fixed: no_match only when every settings combination ran; timeouts are inconclusive; outages are unavailable; retries the repo's last commit before deployment. Live engine tests reproduced by the director (10 of 10). UI polished with unslop; labelled Stageshow hero added.
- 2026-11-01 server results: true match 5s, false claim refused 21s, OpenZeppelin deployment-commit match 93s, peak 439 MB, neighbours unaffected.

## Next actions, in order

1. Owner must run the corrected Caddy command (see director.private.md). The first attempt added a stray `nonescan` line because PowerShell stripped double quotes. Then confirm the public URL and neighbours.
2. Walk the true-match journey in the browser: proof page, badge, share link. Only the false-claim path has been walked through the UI so far.
3. When tPOT arrives: `scripts/new-attester.mjs`, deploy ProofRegistry, test wrong-hash and non-attester reverts and EXTCODEHASH on testnet, set REGISTRY_ADDRESS and ATTESTER_PRIVATE_KEY in the server env file.
4. Owner UAT of the Fund panel, untested with a real wallet.
5. Add real usage: run public team contracts, publish a V3 coverage figure, share in Discord.
6. README (credit unslop and Stageshow, disclose dependencies), security and repo audit, demo video, pitch deck, DoraHacks submission before 2026-11-06 04:00 UTC.
