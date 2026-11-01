# Third-party notices

OneScan uses the work below. Each project keeps its own license and copyright.
Licenses for npm packages were read from the installed `package.json` files.

## Copied or adapted into this repository

**Stageshow** by Benji Taylor. MIT License.
A copy of the kit is in `src/components/stageshow-kit/`, with its `LICENSE` and its own `NOTICE.md`.
It draws the home page illustration. Upstream: https://github.com/benjitaylor/skills
Changes are listed in `src/components/stageshow-kit/MODIFIED.txt`: unused brand artwork removed, a lint-disable comment added to each source file, one comment dash and three small font sizes edited.
Stageshow's own notice says product names, app icons and brand artwork shown in its examples stay with their owners; its license does not grant those rights.

**unslop** by Damir Sokolovsky. Creative Commons Attribution 4.0 International (CC BY 4.0).
I used the unslop process to edit the interface copy so it reads like a person wrote it. Credit is required and is given here and in the README: https://github.com/heydamir/unslop
The process was applied to OneScan's own wording. This repository does not claim the unslop process or its text as its own.

## Dependencies (installed from npm, not copied)

| Package | Version | License |
| --- | --- | --- |
| `next` | 16.4.3 | MIT |
| `react`, `react-dom` | 19.3.0 | MIT |
| `tailwindcss`, `@tailwindcss/turbopack` | 4.3.3 | MIT |
| `viem` | 2.57.14 | MIT |
| `@polkadot/api` | 17.0.2 | Apache-2.0 |
| `@polkadot/extension-dapp` | 0.64.1 | Apache-2.0 |
| `@polkadot/util`, `@polkadot/util-crypto` | 14.0.3 | Apache-2.0 |
| `solc` (solc-js) | 0.8.38 | MIT |
| `tar` | 7.5.22 | BlueOak-1.0.0 |
| `cbor-x` | 1.6.8 | MIT |
| `lucide-react` | 1.66.0 | ISC |

Development only: `typescript` (Apache-2.0), `vitest` (MIT), `eslint` and `eslint-config-next` (MIT), `@types/node`, `@types/react`, `@types/react-dom` (MIT).
Their own dependencies are listed in `package-lock.json`.

## Tools and services used, not included

- **Foundry** (`forge`, `anvil`), MIT or Apache-2.0 at your option. Used to build and test `contracts/ProofRegistry.sol` and to run the local chain behind `attest.test.ts`.
- **Solidity compiler releases** from https://binaries.soliditylang.org, downloaded at run time and checked against the published sha256. The Solidity compiler is GPL-3.0 licensed software. OneScan runs it as a separate binary file and does not include it in this repository.
- **Fonts** Geist, Geist Mono and Fraunces, loaded through `next/font/google` (SIL Open Font License 1.1).
- **Portaldot V3 testnet** public RPC and node endpoints, **GitHub**, and **jsDelivr** (for npm package sources) are called at run time.

## Other builders' repositories

The README and tests name three public repositories as test inputs: `Firzadf/nodescope`, `Gieez/portaldot-revivescope` and `Rohitamalraj/DotProof`. Their source is downloaded at check time and is not stored in this repository. OneScan is not affiliated with them.

OneScan is an independent tool and is not affiliated with Portaldot.
