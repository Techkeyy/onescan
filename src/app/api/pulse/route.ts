import { getBlockNumber } from "@/lib/chain";
import { getStore } from "@/lib/store";
import type { Pulse } from "@/lib/types";
import { json } from "../_lib/util";

export const dynamic = "force-dynamic";

// Many viewers share one chain read.
const BLOCK_TTL_MS = 4000;
let cached: { at: number; block: number | null } = { at: 0, block: null };

async function block(): Promise<number | null> {
  if (Date.now() - cached.at < BLOCK_TTL_MS) return cached.block;
  const value = await getBlockNumber().catch(() => null);
  cached = { at: Date.now(), block: value };
  return value;
}

export async function GET() {
  const store = getStore();
  const proofs = store.listProofs();
  const pulse: Pulse = {
    block: await block(),
    queued: store.countQueued(),
    proofs: proofs.length,
    exact: proofs.filter((p) => p.match.kind === "exact").length,
    latest: proofs.slice(0, 6).map((p) => ({
      address: p.address,
      repo: p.repo,
      contract: p.match.contract,
      kind: p.match.kind,
      commit: p.commit,
      checkedAt: p.checkedAt,
    })),
  };
  return json(pulse);
}
