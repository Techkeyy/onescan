import Link from "next/link";
import { BlockStrip } from "@/components/BlockStrip";
import { CheckFlow } from "@/components/CheckFlow";
import { CommitTimeline } from "@/components/CommitTimeline";
import { HeroSceneLoader } from "@/components/HeroSceneLoader";
import { LiveStatus } from "@/components/LiveStatus";
import { ProofLedger } from "@/components/ProofLedger";
import { Coverage } from "@/components/Coverage";
import { VerdictExplorer } from "@/components/VerdictExplorer";
import { btnPrimary, btnSecondary } from "@/components/ui";

const NODESCOPE = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";
const LENDING = "0x7e3444c1f9dbd53dea5ebc8160522b154857566b";
const REFUSE = `/check?repo=Gieez/portaldot-revivescope&address=${NODESCOPE}&run=1`;
const MATCH = `/check?repo=Firzadf/nodescope&address=${NODESCOPE}&run=1`;

const wrap = "mx-auto w-full max-w-6xl px-4";
const h2 = "font-serif text-3xl font-medium leading-tight sm:text-4xl";

const LIMITS = [
  "A match says the code is what the repo shows. It does not say the code is safe. This is not an audit.",
  "It checks Solidity contracts on the EVM side of Portaldot V3. PolkaVM and ink! contracts are not checked yet.",
  "A contract deployed from code that was never committed can never match any commit.",
  "The on-chain record is a statement by OneScan's checker. The real proof is that anyone can repeat the check.",
];

export default function Home() {
  return (
    <div>
      <section className="border-b border-rule">
        <div className={`${wrap} grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-10 py-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:py-20`}>
          <div>
            <LiveStatus />
            <h1 className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              A repo link proves nothing. OneScan checks it against the chain.
            </h1>
            <p className="mt-6 max-w-xl text-lg">
              On Portaldot V3, anyone can put a GitHub link next to a contract address. Paste both here and OneScan
              rebuilds the code and tells you whether it is what is really running. No wallet, no account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/check" className={btnPrimary}>
                Check a contract
              </Link>
              <Link href={REFUSE} className={btnSecondary}>
                Watch it refuse a false claim
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted">The second button runs a real check, right now, on real contracts.</p>
          </div>

          <aside aria-label="Latest proofs" className="border border-rule bg-surface">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3">
              <h2 className="font-serif text-xl font-medium">Proof ledger</h2>
              <Link href="/proofs" className="text-sm text-accent underline">
                See all
              </Link>
            </div>
            <div className="px-4">
              <ProofLedger limit={5} />
            </div>
            <div className="space-y-4 border-t border-rule px-4 py-4">
              <Coverage />
              <BlockStrip />
            </div>
          </aside>
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} reveal grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-8 py-14 lg:grid-cols-2 lg:py-20`}>
          <div>
            <h2 className={h2}>The latest code is often not the running code</h2>
            <p className="mt-4 max-w-xl text-lg">
              Teams keep committing after they deploy. A reader who opens the repo sees one thing while the chain runs
              another, and nothing on the page tells them.
            </p>
          </div>
          <div>
            <p className="font-medium">One real contract on V3, checked by OneScan</p>
            <div className="mt-3">
              <CommitTimeline />
            </div>
            <p className="mt-2 text-muted">OneScan found the deployment commit by itself and says so on the proof.</p>
            <Link href={`/proof/${LENDING}`} className="mt-3 inline-block text-accent underline">
              Open this proof
            </Link>
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-rule">
        <div className={`${wrap} reveal py-14 lg:py-20`}>
          <h2 className={h2}>How a check runs</h2>
          <CheckFlow />
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} reveal py-14 lg:py-20`}>
          <h2 className={h2}>Four possible answers, and it never guesses</h2>
          <VerdictExplorer />
        </div>
      </section>

      <section className="border-b border-rule">
        <div className={`${wrap} reveal grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-10 py-14 lg:grid-cols-2 lg:py-20`}>
          <div className="space-y-12">
            <div>
              <h2 className={h2}>If you built it, show it</h2>
              <p className="mt-4 max-w-xl text-lg">
                Check your own contract and you get a public proof page and a badge for your README. The badge is read
                live, so if the code at the address ever changes, it stops saying it matches.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/badge/${NODESCOPE}`} alt="Example OneScan badge showing a real proof" className="mt-5 h-5" />
              <Link href={MATCH} className={`${btnSecondary} mt-6`}>
                Run a real match
              </Link>
            </div>
            <div>
              <h2 className={h2}>If you are checking someone else&apos;s</h2>
              <p className="mt-4 max-w-xl text-lg">
                Judging, integrating or about to use a contract? You need only their repo and their address. Every
                proof lists the exact commit, compiler and settings, so you can repeat the check without OneScan.
              </p>
              <Link href="/proofs" className={`${btnSecondary} mt-6`}>
                Browse the proofs
              </Link>
            </div>
          </div>
          <HeroSceneLoader />
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} reveal grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-6 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:py-20`}>
          <h2 className={h2}>What a proof does not tell you</h2>
          <ul className="divide-y divide-rule border-y border-rule">
            {LIMITS.map((l) => (
              <li key={l} className="py-3 text-lg">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className={`${wrap} reveal flex flex-wrap items-center justify-between gap-6 py-14`}>
          <p className="max-w-2xl font-serif text-3xl font-medium leading-tight">
            Have a repo and an address? Find out in about a minute.
          </p>
          <Link href="/check" className={btnPrimary}>
            Check a contract
          </Link>
        </div>
      </section>
    </div>
  );
}
