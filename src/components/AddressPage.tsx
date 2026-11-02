"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { AddressView } from "@/lib/types";
import { useApi } from "./api";
import { formatUnits } from "./format";
import { ErrorBlock, Field, Hash, Loading, Notice, Section, btnSecondary, linkCls } from "./ui";

const FundPanel = dynamic(() => import("./FundPanel"), {
  ssr: false,
  loading: () => <p className="mt-10 text-muted">Loading the funding tool</p>,
});

function Balance({ raw, decimals }: { raw: string | null; decimals: number }) {
  if (raw === null) return <span className="text-warn">Could not read</span>;
  const f = formatUnits(raw, decimals);
  return (
    <span title={`${f.full} tPOT`} className="font-mono">
      {f.short} <span className="font-sans text-muted">tPOT</span>
    </span>
  );
}

export function AddressPage({ input }: { input: string }) {
  const { loading, result: fresh, lastGood, reload } = useApi<AddressView>(`/api/address/${encodeURIComponent(input)}`);
  // A refresh keeps the page in place, so the wallet panel below keeps its result on screen.
  const result = lastGood ?? fresh;
  const refreshFailed = !loading && !!lastGood && !!fresh && !fresh.ok;

  if (loading && !lastGood) return <Loading what="Reading the account from the chain. This can take up to 30 seconds." />;
  if (!result) return null;
  if (!result.ok) {
    if (result.status === 400) {
      return (
        <div className="py-4">
          <h1 className="font-serif text-3xl font-medium">That is not an address</h1>
          <p className="mt-3 max-w-2xl">
            Use a 0x address (42 characters) or a 5... address. Check that nothing was cut off when you copied it.
          </p>
          <div className="mt-4">
            <Link href="/check" className={btnSecondary}>
              Back to the check form
            </Link>
          </div>
        </div>
      );
    }
    return (
      <ErrorBlock title="Could not read this account" onRetry={reload}>
        <p>{result.status === 0 ? "OneScan could not be reached." : result.error}</p>
      </ErrorBlock>
    );
  }

  const v = result.data;
  const isContract = v.vm !== "none";
  const canPrefill = v.origin === "eth" && !isContract;

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium sm:text-4xl">
        {isContract ? "Contract account" : "Account"}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        One account has two forms: a 5... address that the Substrate side uses and a 0x address that EVM tools use.
      </p>

      <section className="mt-6 border border-ink/30 bg-surface px-4 py-2 [&_dl>div:first-child]:border-t-0" aria-label="Account">
        <dl>
          <Field label="5... address">
            <Hash value={v.native} />
          </Field>
          <Field label="0x address">
            <Hash value={v.h160} />
          </Field>
          <Field label="Native balance">
            <Balance raw={v.nativeFree} decimals={14} />
          </Field>
          <Field label="EVM balance">
            <Balance raw={v.evmBalance} decimals={18} />
          </Field>
          <Field label="Kind">
            {isContract
              ? `Contract (${v.vm === "evm" ? "EVM" : "PolkaVM"})`
              : v.origin === "eth"
                ? "Account with a 0x key, such as MetaMask"
                : "Account with a 5... key"}
          </Field>
        </dl>
      </section>

      {refreshFailed && (
        <div className="mt-4">
          <Notice tone="warn" role="status" title="These balances may be out of date">
            OneScan could not read them again just now.{" "}
            <button type="button" onClick={reload} className={linkCls}>
              Read again
            </button>
          </Notice>
        </div>
      )}

      {(v.nativeFree === null || v.evmBalance === null) && (
        <div className="mt-4">
          <Notice tone="warn" role="status" title="One balance could not be read">
            The node did not answer for it. This is not the same as zero.{" "}
            <button type="button" onClick={reload} className={linkCls}>
              Read again
            </button>
          </Notice>
        </div>
      )}

      {v.proof && (
        <Section title="Proof">
          <p>
            This contract is proven to match{" "}
            <span className="font-medium">{v.proof.repo}</span> ({v.proof.kind === "exact" ? "exact match" : "code matches"}).{" "}
            <Link href={`/proof/${v.h160}`} className={linkCls}>
              Open the proof
            </Link>
          </p>
        </Section>
      )}

      <FundPanel target={canPrefill ? v.h160 : ""} onChanged={reload} />
    </div>
  );
}
