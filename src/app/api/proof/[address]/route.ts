import { getActivity, getCreation } from "@/lib/chain";
import { getStore } from "@/lib/store";
import type { Activity, Creation, ProofView } from "@/lib/types";
import { json, liveStatus, normaliseAddress } from "../../_lib/util";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const address = normaliseAddress((await params).address);
  if (!address) return json({ error: "address must be 0x followed by 40 hex characters." }, 400);
  const store = getStore();
  const proof = store.getProof(address);
  if (!proof) return json({ error: "No proof for this address." }, 404);

  const cached = store.getCreation(address);
  const [live, creation, activity] = await Promise.all([
    liveStatus(address, proof.runtimeHash),
    cached
      ? Promise.resolve<Creation | null>(cached)
      : getCreation(address)
          .then((c) => {
            if (c) store.putCreation(address, c); // creation never changes
            return c;
          })
          .catch(() => null),
    getActivity(address, proof.match.abi).catch((): Activity | null => null),
  ]);

  const view: ProofView = {
    ...proof,
    live: live.live,
    // A stored proof is always for EVM code; if the read failed we have nothing newer to say.
    vm: live.vm ?? "evm",
    creation,
    activity,
  };
  return json(view);
}
