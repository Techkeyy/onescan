import type { Metadata } from "next";
import { AddressPage } from "@/components/AddressPage";
import { Work } from "@/components/Work";

export async function generateMetadata({ params }: PageProps<"/address/[address]">): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Account ${address.slice(0, 10)}...`,
    description: "Both forms of a Portaldot V3 account address, with the native and EVM balances.",
  };
}

export default async function Page({ params }: PageProps<"/address/[address]">) {
  const { address } = await params;
  return (
    <Work>
      <AddressPage input={decodeURIComponent(address)} />
    </Work>
  );
}
