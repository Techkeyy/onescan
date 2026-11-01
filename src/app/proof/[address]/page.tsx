import type { Metadata } from "next";
import { ProofView } from "@/components/ProofView";

export async function generateMetadata({ params }: PageProps<"/proof/[address]">): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Proof for ${address.slice(0, 10)}...`,
    description: `Whether the GitHub repo claimed for contract ${address} is the code running on Portaldot V3.`,
  };
}

export default async function ProofPage({ params }: PageProps<"/proof/[address]">) {
  const { address } = await params;
  return <ProofView address={address} />;
}
