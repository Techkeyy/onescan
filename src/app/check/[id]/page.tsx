import type { Metadata } from "next";
import { CheckView } from "@/components/CheckView";
import { Work } from "@/components/Work";

export const metadata: Metadata = { title: "Check" };

export default async function CheckPage({ params }: PageProps<"/check/[id]">) {
  const { id } = await params;
  return (
    <Work>
      <CheckView id={id} />
    </Work>
  );
}
