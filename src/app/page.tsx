import Link from "next/link";
import { Suspense } from "react";
import { CheckForm } from "@/components/CheckForm";
import { HeroSceneLoader } from "@/components/HeroSceneLoader";

const STEPS = [
  "OneScan reads the code running at the address and the compiler version stored inside it.",
  "It fetches your repo at a commit and compiles it with that same compiler.",
  "It compares the two. Only a real match gets a public proof page. A mismatch is never listed.",
];

export default function Home() {
  return (
    <div>
      <div className="grid items-center gap-x-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div>
          <h1 className="font-serif text-3xl font-medium leading-tight sm:text-4xl">
            OneScan checks whether a GitHub repo is the code running at a Portaldot V3 contract address.
          </h1>
          <div className="mt-8">
            <Suspense fallback={<p className="text-muted">Loading the form</p>}>
              <CheckForm />
            </Suspense>
          </div>
        </div>
        <HeroSceneLoader />
      </div>

      <section className="mt-16 max-w-2xl border-t border-rule pt-6" aria-labelledby="how">
        <h2 id="how" className="font-serif text-2xl font-medium">
          How it works
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-4">
          No wallet and no account. Every proof can be checked again by anyone.{" "}
          <Link href="/proofs" className="text-accent underline">
            See the proofs so far
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
