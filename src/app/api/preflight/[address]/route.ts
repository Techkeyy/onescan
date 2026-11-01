import { getCode, vmKind } from "@/lib/chain";
import { getStore } from "@/lib/store";
import type { Preflight } from "@/lib/types";
import { solcVersionFromMetadata, splitMetadata } from "@/lib/verify/metadata";
import { json, normaliseAddress } from "../../_lib/util";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const address = normaliseAddress((await params).address);
  if (!address) return json({ error: "address must be 0x followed by 40 hex characters." }, 400);
  let code: string;
  try {
    code = await getCode(address);
  } catch {
    return json({ error: "The chain could not be read just now." }, 503);
  }
  const vm = vmKind(code);
  const proof = getStore().getProof(address);
  const preflight: Preflight = {
    vm,
    bytes: code === "0x" ? 0 : (code.length - 2) / 2,
    compiler: vm === "evm" ? solcVersionFromMetadata(splitMetadata(code).decoded) : null,
    proof: proof ? { repo: proof.repo, kind: proof.match.kind } : null,
  };
  return json(preflight);
}
