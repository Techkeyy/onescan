import { getStore } from "@/lib/store";
import { json } from "../_lib/util";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = getStore()
    .listProofs()
    .map((p) => {
      const match = { ...p.match } as Partial<typeof p.match>;
      delete match.source;
      delete match.abi;
      return { ...p, match };
    });
  return json(list);
}
