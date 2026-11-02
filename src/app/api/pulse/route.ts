import census from "@/lib/census.json";
import { getBlockNumber } from "@/lib/chain";
import { getStore } from "@/lib/store";
import type { Pulse } from "@/lib/types";
import { json } from "../_lib/util";

export const dynamic = "force-dynamic";

// Every open page polls this, so viewers share one chain read and one database read.
const TTL_MS = 4000;
let cached: { at: number; pulse: Pulse } | null = null;
const direct = new Set(census.addresses);

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) return json(cached.pulse);
  const store = getStore();
  const proofs = store.listProofs();
  const pulse: Pulse = {
    block: await getBlockNumber().catch(() => null),
    queued: store.countQueued(),
    proofs: proofs.length,
    exact: proofs.filter((p) => p.match.kind === "exact").length,
    census: {
      contracts: direct.size,
      block: census.block,
      proven: proofs.filter((p) => direct.has(p.address.toLowerCase())).length,
    },
    latest: proofs.slice(0, 6).map((p) => ({
      address: p.address,
      repo: p.repo,
      contract: p.match.contract,
      kind: p.match.kind,
      commit: p.commit,
      checkedAt: p.checkedAt,
    })),
  };
  cached = { at: Date.now(), pulse };
  return json(pulse);
}
