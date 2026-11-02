# OneScan API

Types are in `src/lib/types.ts`. All routes are public and read-only except starting a check.

| Route | Purpose | Returns |
| --- | --- | --- |
| `POST /api/check` body `{ repo, address, commit? }` | Start a check. `repo` accepts `owner/name` or a github.com URL | `201 { id }`; `400 { error }` on bad input; `413 { error }` over 4 KB; `429 { error }` when rate limited or the queue is full |
| `GET /api/check/[id]` | Poll a check | `Job`; when `state` is `matched`, the UI goes to `/proof/<address>` |
| `GET /api/proof/[address]` | A proof, re-checked live | `ProofView` or `404` |
| `GET /api/proofs` | Matched proofs, newest first | `Proof[]` without `match.source` and `match.abi` |
| `GET /api/address/[address]` | `5…` or `0x…` | `AddressView`, or `400` |
| `GET /badge/[address]` | README badge | SVG: "OneScan: code matches" / "exact match" / "not checked" / "code changed" |
| `GET /api/pulse` | Live status for the site: latest block, queue length, proof counts, coverage of the chain census, six latest proofs | `Pulse` |
| `GET /api/preflight/[address]` | Quick read before a check: VM kind, code size, solc version, existing proof | `Preflight`, `400`, or `503` when the chain cannot be read |

Pages: `/` landing page, `/check` the workspace with the check form, `/check/[id]` live stages, `/proof/[address]`, `/proofs`, `/address/[address]` with the wallet tools.

Identical input while a check is queued or running returns the existing job id. A stored proof for the same address is replaced only by a newer match. A failed check never overwrites a proof.
