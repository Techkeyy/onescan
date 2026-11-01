import { parseAddress, withOriginalAccount } from "@/lib/address";
import { getBalance, getCode, vmKind } from "@/lib/chain";
import { getNativeFree, getOriginalAccount } from "@/lib/native";
import { getStore } from "@/lib/store";
import type { AddressView } from "@/lib/types";
import { json } from "../../_lib/util";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  let raw = (await params).address;
  try {
    raw = decodeURIComponent(raw);
  } catch {}
  let p = parseAddress(raw);
  if (!p) return json({ error: "Enter a 5... address or a 0x address." }, 400);

  // revive.originalAccount decides the truth: a mapped native account owns its keccak H160.
  const orig = await getOriginalAccount(p.h160);
  let mapped = p.origin === "eth"; // eth-origin accounts need no mapping
  if (orig?.account) {
    if (p.inputKind === "h160") p = withOriginalAccount(p, orig.account);
    mapped = true;
  }
  // If the chain says "not set" or could not be read, a native account is reported unmapped:
  // we never claim mapped without seeing it.

  const [nativeFree, evm, code] = await Promise.all([
    getNativeFree(p.native),
    getBalance(p.h160).then(
      (b) => b.toString(),
      () => null,
    ),
    getCode(p.h160).catch(() => null),
  ]);
  const proof = getStore().getProof(p.h160);

  const view: AddressView = {
    input: p.input,
    native: p.native,
    h160: p.h160,
    origin: p.origin,
    mapped,
    nativeFree,
    evmBalance: evm,
    vm: code === null ? "none" : vmKind(code),
    proof: proof ? { repo: proof.repo, kind: proof.match.kind } : null,
  };
  return json(view);
}
