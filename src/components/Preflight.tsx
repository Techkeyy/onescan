"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Preflight as Data } from "@/lib/types";
import { apiGet } from "./api";
import { ADDRESS_0X } from "./format";

type State = { address: string; data: Data | null; failed: boolean };

/** Reads the address as soon as it is complete, so bad input is caught before anyone waits on a compile. */
export function Preflight({ address }: { address: string }) {
  const a = address.trim().toLowerCase();
  const valid = ADDRESS_0X.test(a);
  const [got, setGot] = useState<State | null>(null);

  useEffect(() => {
    if (!valid) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      const r = await apiGet<Data>(`/api/preflight/${a}`, ac.signal);
      if (!ac.signal.aborted) setGot({ address: a, data: r.ok ? r.data : null, failed: !r.ok });
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [a, valid]);

  if (!valid) return null;
  if (got?.address !== a) {
    return <p className="mt-2 text-sm text-muted">Reading this address from the chain</p>;
  }
  if (got.failed || !got.data) {
    return <p className="mt-2 text-sm text-muted">Could not read this address just now. You can still run the check.</p>;
  }
  const d = got.data;
  if (d.vm === "none") return <p className="mt-2 text-sm text-warn">Nothing is deployed at this address on Portaldot V3.</p>;
  if (d.vm === "polkavm") {
    return <p className="mt-2 text-sm text-warn">This contract is PolkaVM code, which OneScan cannot check yet.</p>;
  }
  return (
    <p className="mt-2 text-sm text-muted">
      <span className="font-medium text-ok">Contract found.</span> {d.bytes.toLocaleString()} bytes of EVM code
      {d.compiler ? `, built with solc ${d.compiler}.` : ", with no compiler version stored, so it cannot be checked."}
      {d.proof && (
        <>
          {" "}
          Already proven against {d.proof.repo}.{" "}
          <Link href={`/proof/${a}`} className="text-accent underline">
            Open the proof
          </Link>
        </>
      )}
    </p>
  );
}
