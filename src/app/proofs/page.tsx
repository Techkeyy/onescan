import type { Metadata } from "next";
import { ProofsList } from "@/components/ProofsList";

export const metadata: Metadata = {
  title: "Proofs",
  description: "Contracts on Portaldot V3 whose GitHub repo has been checked and matches.",
};

export default function ProofsPage() {
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Proofs</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Newest first. Only checks that matched are listed. A failed check is never published.
      </p>
      <div className="mt-6">
        <ProofsList />
      </div>
    </div>
  );
}
