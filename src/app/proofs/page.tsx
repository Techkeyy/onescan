import type { Metadata } from "next";
import { Coverage } from "@/components/Coverage";
import { ProofsList } from "@/components/ProofsList";
import { Work } from "@/components/Work";

export const metadata: Metadata = {
  title: "Proofs",
  description: "Contracts on Portaldot V3 whose GitHub repo has been checked and matches.",
};

export default function ProofsPage() {
  return (
    <Work>
      <h1 className="font-serif text-3xl font-medium sm:text-4xl">Proofs</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Newest first. Only checks that matched are listed. A failed check is never published.
      </p>
      <div className="mt-3">
        <Coverage />
      </div>
      <div className="mt-6">
        <ProofsList />
      </div>
    </Work>
  );
}
