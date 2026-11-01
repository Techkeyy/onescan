import type { Metadata } from "next";
import Link from "next/link";
import { CheckForm } from "@/components/CheckForm";
import { ProofLedger } from "@/components/ProofLedger";
import { RecentChecks } from "@/components/RecentChecks";
import { Work } from "@/components/Work";

export const metadata: Metadata = {
  title: "Check a contract",
  description: "Paste a public GitHub repo and a Portaldot V3 contract address to see whether the repo is what is running.",
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CheckPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  return (
    <Work>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <h1 className="font-serif text-4xl font-medium leading-tight">Check a contract</h1>
          <p className="mt-2 max-w-xl text-lg text-muted">Is this repo the code running at this address?</p>
          <div className="mt-6">
            <CheckForm
              initial={{ repo: one(q.repo), address: one(q.address), commit: one(q.commit) }}
              autoRun={one(q.run) === "1"}
            />
          </div>
        </div>
        <div className="space-y-6">
          <RecentChecks />
          <section aria-labelledby="latest-title" className="border border-rule bg-surface">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3">
              <h2 id="latest-title" className="font-serif text-xl font-medium">
                Latest proofs
              </h2>
              <Link href="/proofs" className="text-sm text-accent underline">
                See all
              </Link>
            </div>
            <div className="px-4">
              <ProofLedger limit={4} />
            </div>
          </section>
        </div>
      </div>
    </Work>
  );
}
