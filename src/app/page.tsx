import Link from "next/link";
import { HeroSceneLoader } from "@/components/HeroSceneLoader";
import { LiveStatus } from "@/components/LiveStatus";
import { ProofLedger } from "@/components/ProofLedger";
import { Coverage } from "@/components/Coverage";
import { btnPrimary, btnSecondary } from "@/components/ui";

const NODESCOPE = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";
const LENDING = "0x7e3444c1f9dbd53dea5ebc8160522b154857566b";
const REFUSE = `/check?repo=Gieez/portaldot-revivescope&address=${NODESCOPE}&run=1`;
const MATCH = `/check?repo=Firzadf/nodescope&address=${NODESCOPE}&run=1`;

const wrap = "mx-auto w-full max-w-6xl px-4";
const h2 = "font-serif text-3xl font-medium leading-tight sm:text-4xl";

const STEPS = [
  ["Reads the chain", "OneScan fetches the code running at the address and reads the compiler version stored inside it."],
  ["Fetches the repo", "It pins your repo to one exact commit, so the answer can never drift with later pushes."],
  [
    "Rebuilds the code",
    "It compiles the repo with that same compiler, trying the repo's own settings first. Nothing from the repo is ever executed.",
  ],
  [
    "Compares byte for byte",
    "The rebuilt code is held against the running code. Anything weaker than an equal result is not a match.",
  ],
  [
    "Looks back if it must",
    "If the latest code fails, it retries the last commit from before deployment, because repos often move on.",
  ],
] as const;

const VERDICTS = [
  ["text-ok", "Exact match", "The running code and the repo are identical, right down to the fingerprint the compiler embeds."],
  ["text-ok", "Code matches", "The running code is the same. Only the embedded fingerprint differs, usually a comment or a file path."],
  ["text-ink", "Does not match", "The repo compiled under every setting OneScan tries, and none of them reproduced the running code."],
  [
    "text-warn",
    "Could not finish",
    "Time ran out or a service was down. No comparison was completed, so this is never treated as a failure of the repo.",
  ],
] as const;

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
            <div className="border-t border-rule px-4 py-3">
              <Coverage />
            </div>
          </aside>
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-8 py-14 lg:grid-cols-2 lg:py-20`}>
          <div>
            <h2 className={h2}>The latest code is often not the running code</h2>
            <p className="mt-4 max-w-xl text-lg">
              Teams keep committing after they deploy. A reader who opens the repo sees one thing while the chain runs
              another, and nothing on the page tells them.
            </p>
          </div>
          <div>
            <p className="font-medium">One real contract on V3, checked by OneScan</p>
            <ol className="mt-3">
              <li className="border-l-2 border-bad py-3 pl-4">
                <p className="font-medium">Latest commit on the default branch</p>
                <p className="text-muted">Compiled and compared. It does not produce the running code.</p>
              </li>
              <li className="border-l-2 border-ok py-3 pl-4">
                <p className="font-medium">Last commit before the contract was deployed</p>
                <p className="text-muted">Exact match. OneScan found this commit by itself and says so on the proof.</p>
              </li>
            </ol>
            <Link href={`/proof/${LENDING}`} className="mt-3 inline-block text-accent underline">
              Open this proof
            </Link>
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-rule">
        <div className={`${wrap} grid grid-cols-[minmax(0,1fr)] items-start gap-x-16 gap-y-10 py-14 lg:grid-cols-2 lg:py-20`}>
          <div>
            <h2 className={h2}>How a check runs</h2>
            <ol className="mt-6 space-y-6">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
                  <span className="font-serif text-2xl text-accent" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 max-w-lg text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <HeroSceneLoader />
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} py-14 lg:py-20`}>
          <h2 className={h2}>Four possible answers, and it never guesses</h2>
          <dl className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {VERDICTS.map(([tone, title, body]) => (
              <div key={title} className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <dt
                  className={`self-start rounded border-2 border-current px-3 py-2 text-center font-serif text-lg font-medium ${tone}`}
                >
                  {title}
                </dt>
                <dd className="text-ink">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className={`${wrap} grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-10 py-14 lg:grid-cols-2 lg:py-20`}>
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
              Judging, integrating or about to use a contract? You need only their repo and their address. Every proof
              lists the exact commit, compiler and settings, so you can repeat the check without OneScan.
            </p>
            <Link href="/proofs" className={`${btnSecondary} mt-6`}>
              Browse the proofs
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-rule bg-surface">
        <div className={`${wrap} grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-6 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:py-20`}>
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
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-6 py-14`}>
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
