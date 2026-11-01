"use client";

import Link from "next/link";
import type { Attestation, ProofView as ProofViewData } from "@/lib/types";
import { useApi } from "./api";
import { formatDate, githubCommitUrl, githubFileUrl } from "./format";
import {
  ErrorBlock,
  Field,
  Hash,
  Loading,
  Notice,
  Section,
  Stamp,
  btnSecondary,
  linkCls,
  useOrigin,
  CopyButton,
} from "./ui";

const EVM_RPC = "https://test-evm-rpc-v3.portaldot.dev";

function LiveBanner({ live }: { live: ProofViewData["live"] }) {
  if (live === "current") {
    return (
      <Notice tone="ok" role="status" title="Re-checked against the chain just now">
        The code running at this address is still the code that was proven.
      </Notice>
    );
  }
  if (live === "changed") {
    return (
      <div role="alert" className="border-4 border-bad bg-bad-bg p-4">
        <p className="font-serif text-2xl font-semibold text-bad">Warning: the code at this address has changed</p>
        <p className="mt-1">
          The code running there now is different from what was proven below. Do not rely on this proof for the
          contract as it is today.
        </p>
      </div>
    );
  }
  return (
    <Notice tone="warn" role="status" title="Could not re-check against the chain">
      OneScan could not read the chain just now, so it cannot say whether the code is still the same. The proof below
      is what was true when it was made.
    </Notice>
  );
}

function AttestationBlock({ a }: { a: Attestation }) {
  let head: React.ReactNode;
  switch (a.state) {
    case "none":
      head = <Notice title="Not recorded on-chain yet">No on-chain record has been requested for this proof.</Notice>;
      break;
    case "requested":
      head = (
        <Notice tone="warn" title="Waiting to be recorded">
          The record has been requested and has not been sent to the chain yet.
        </Notice>
      );
      break;
    case "submitted":
      head = (
        <Notice tone="warn" title="Pending on-chain">
          The record was sent and is waiting to be included in a block.
          {a.txHash && (
            <div className="mt-2">
              <Hash value={a.txHash} />
            </div>
          )}
        </Notice>
      );
      break;
    case "confirmed":
      head = (
        <Notice tone="ok" title="Recorded on-chain">
          <div className="mt-1">
            Transaction <Hash value={a.txHash ?? ""} />
          </div>
        </Notice>
      );
      break;
    case "failed":
      head = (
        <Notice tone="bad" title="The on-chain record failed">
          {a.error ? <p className="break-words">{a.error}</p> : <p>No reason was given.</p>}
          <p className="mt-1">The proof itself is unaffected.</p>
        </Notice>
      );
      break;
  }
  return (
    <div>
      {head}
      {a.registry && (
        <p className="mt-3 text-sm text-muted">
          Registry contract: <Hash value={a.registry} />
        </p>
      )}
      <p className="mt-3 max-w-2xl">
        An on-chain record means OneScan&apos;s checker attested that this repo matches this contract. It is a
        statement by OneScan, not independent proof. You do not have to trust it, because anyone can repeat the check
        with the steps below.
      </p>
    </div>
  );
}

function Reproduce({ p }: { p: ProofViewData }) {
  const s = p.match.settings;
  const settings = [
    `optimizer ${s.optimizer.enabled ? `on, ${s.optimizer.runs} runs` : "off"}`,
    s.viaIR ? "viaIR on" : "viaIR off",
    s.evmVersion ? `EVM version ${s.evmVersion}` : "default EVM version",
  ].join(", ");
  return (
    <ol className="list-decimal space-y-2 pl-5">
      <li>
        Get the repo at the exact commit:{" "}
        <code className="break-all font-mono text-sm">
          git clone https://github.com/{p.repo} &amp;&amp; git checkout {p.commit}
        </code>
      </li>
      <li>
        Compile <code className="break-all font-mono text-sm">{p.match.file}</code> with solc{" "}
        <code className="font-mono text-sm">{p.match.settings.version}</code> using these settings: {settings}.
      </li>
      <li>
        Take the runtime (deployed) bytecode of <code className="font-mono text-sm">{p.match.contract}</code> from the
        compiler output.
      </li>
      <li>
        Ask the chain for the code at the address:{" "}
        <code className="break-all font-mono text-sm">
          eth_getCode({p.address}, &quot;latest&quot;)
        </code>{" "}
        on <code className="break-all font-mono text-sm">{EVM_RPC}</code>.
      </li>
      <li>
        Compare the two. {p.match.kind === "exact" ? "They are identical, including the metadata hash." : "Remove the metadata hash stored at the very end of both, and mask any immutable values. What remains is identical."}{" "}
        The keccak256 of the on-chain code was{" "}
        <code className="break-all font-mono text-sm">{p.runtimeHash}</code> when this was proven.
      </li>
    </ol>
  );
}

function Share({ address }: { address: string }) {
  const origin = useOrigin();
  const url = `${origin}/proof/${address}`;
  const badgeSrc = `/badge/${address}`;
  const markdown = `[![OneScan](${origin}/badge/${address})](${url})`;
  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Link to this proof</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 truncate font-mono text-sm" title={url}>
            {url}
          </code>
          <CopyButton value={url} label="Copy link" />
        </div>
      </div>
      <div>
        <p className="font-medium">README badge</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeSrc} alt="OneScan badge for this contract" className="mt-2 h-5" />
        <div className="mt-2 flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all border border-rule bg-surface p-2 font-mono text-sm">
            {markdown}
          </code>
          <CopyButton value={markdown} label="Copy markdown" />
        </div>
      </div>
    </div>
  );
}

export function ProofView({ address }: { address: string }) {
  const { loading, result, reload } = useApi<ProofViewData>(`/api/proof/${address}`);

  if (loading) return <Loading what="Loading the proof and re-checking it against the chain. The first load can take up to 20 seconds." />;
  if (!result) return null;

  if (!result.ok && result.status === 404) {
    return (
      <div className="py-4">
        <h1 className="font-serif text-3xl font-medium sm:text-4xl">No proof for this address</h1>
        <p className="mt-3 max-w-2xl">
          Nobody has proven a repo for this contract yet. Failed checks are never stored, so this does not mean a check
          was tried and failed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/check?address=${encodeURIComponent(address)}`} className={btnSecondary}>
            Check a repo against this contract
          </Link>
          <Link href={`/address/${address}`} className={btnSecondary}>
            See the account
          </Link>
        </div>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <ErrorBlock title="Could not load this proof" onRetry={reload}>
        <p>{result.status === 0 ? "OneScan could not be reached." : result.error}</p>
      </ErrorBlock>
    );
  }

  const p = result.data;
  const changed = p.live === "changed";
  const exact = p.match.kind === "exact";
  const verdict = exact ? "Exact match" : "Code matches";

  return (
    <div>
      {changed && (
        <div className="mb-6">
          <LiveBanner live={p.live} />
        </div>
      )}

      <Stamp
        tone={changed ? "bad" : "ok"}
        kicker={changed ? "Previously proven" : "Verdict"}
        title={verdict}
      >
        {exact ? (
          <p>The code running on-chain and the code in the repo are identical, including the embedded metadata hash.</p>
        ) : (
          <p>
            The running code is the same as the code in the repo. The metadata fingerprint embedded at the end of the
            bytecode differs, which usually means a comment, a path or a build setting changed. The behavior does not.
          </p>
        )}
      </Stamp>

      {p.match.deploymentCommitOf && (
        <div className="mt-6">
          <Notice tone="warn" title="Matched at a different commit than the one requested">
            The requested ref <code className="font-mono text-sm">{p.match.deploymentCommitOf}</code> did not match.
            The repo&apos;s last commit before this contract was deployed did, and that commit is the one proven below.
          </Notice>
        </div>
      )}

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="[&>section:first-child]:mt-0">
      <Section title="What was proven">
        <dl>
          <Field label="Repo">
            <a href={`https://github.com/${p.repo}`} className={linkCls} rel="noopener noreferrer">
              {p.repo}
            </a>
          </Field>
          <Field label="Commit">
            <a
              href={githubCommitUrl(p.repo, p.commit)}
              className={`${linkCls} break-all font-mono text-sm`}
              rel="noopener noreferrer"
              title={p.commit}
            >
              {p.commit}
            </a>
          </Field>
          <Field label="File">
            <a
              href={githubFileUrl(p.repo, p.commit, p.match.file)}
              className={`${linkCls} break-all`}
              rel="noopener noreferrer"
            >
              {p.match.file}
            </a>
          </Field>
          <Field label="Contract">{p.match.contract}</Field>
          <Field label="Address">
            <Hash value={p.address} />{" "}
            <Link href={`/address/${p.address}`} className={`${linkCls} ml-2 text-sm`}>
              Balances
            </Link>
          </Field>
          <Field label="Compiler">
            <span className="font-mono text-sm">solc {p.match.settings.version}</span>
          </Field>
          <Field label="Settings">
            Optimizer {p.match.settings.optimizer.enabled ? `on, ${p.match.settings.optimizer.runs} runs` : "off"}, viaIR{" "}
            {p.match.settings.viaIR ? "on" : "off"},{" "}
            {p.match.settings.evmVersion ? `EVM version ${p.match.settings.evmVersion}` : "default EVM version"}
          </Field>
          <Field label="Code hash">
            <Hash value={p.runtimeHash} />
          </Field>
          <Field label="Proven">{formatDate(p.checkedAt)}</Field>
        </dl>
      </Section>

      <Section title="Deployment">
        {p.creation ? (
          <dl>
            <Field label="Created in block">{p.creation.block.toLocaleString()}</Field>
            <Field label="Creation transaction">
              <Hash value={p.creation.txHash} />
            </Field>
            <Field label="Deployed by">
              <Hash value={p.creation.deployer} />{" "}
              <Link href={`/address/${p.creation.deployer}`} className={`${linkCls} ml-2 text-sm`}>
                Account
              </Link>
            </Field>
            <Field label="Deployed at">{formatDate(p.creation.timestamp)}</Field>
          </dl>
        ) : (
          <Notice title="Creation not found">
            OneScan could not find the transaction that created this contract. It may have been made by another
            contract (a factory), or the chain could not be read just now.
          </Notice>
        )}
      </Section>

      <Section title="Activity">
        {p.activity ? (
          <>
            <p>
              {p.activity.txCount.toLocaleString()} {p.activity.txCount === 1 ? "transaction" : "transactions"} and{" "}
              {p.activity.logCount.toLocaleString()} {p.activity.logCount === 1 ? "event" : "events"} seen.
            </p>
            {p.activity.recent.length === 0 ? (
              <p className="mt-2 text-muted">No events yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {p.activity.recent.map((a, i) => (
                  <li key={`${a.txHash}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                    <span className="font-medium">
                      {a.eventName ?? (
                        <span className="font-normal text-muted">
                          Unknown event{" "}
                          {a.topic0 && (
                            <code title={a.topic0} className="font-mono text-sm">
                              {a.topic0.slice(0, 10)}
                            </code>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-sm text-muted">
                      Block {a.block.toLocaleString()}
                      <Hash value={a.txHash} head={8} tail={6} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Notice title="Activity could not be read">OneScan could not read transactions and events from the chain just now. Reload to try again.</Notice>
        )}
      </Section>

      <Section title="Check it yourself">
        <p className="mb-3 max-w-2xl">You do not need OneScan to confirm this. These steps give the same answer.</p>
        <Reproduce p={p} />
      </Section>

      <Section title="Source">
        <details className="border border-rule bg-surface">
          <summary className="px-4 py-3 font-medium">Show the matched source (read only)</summary>
          <pre
            tabIndex={0}
            aria-label={`Source of ${p.match.file}`}
            className="max-h-[32rem] overflow-auto border-t border-rule p-4 font-mono text-sm leading-relaxed"
          >
            {p.match.source}
          </pre>
        </details>
      </Section>

        </div>
        <aside className="space-y-8 lg:sticky lg:top-24" aria-label="Status and sharing">
          {!changed && <LiveBanner live={p.live} />}
          <section>
            <h2 className="font-serif text-2xl font-medium">Share this proof</h2>
            <div className="mt-3">
              <Share address={p.address} />
            </div>
          </section>
          <section>
            <h2 className="font-serif text-2xl font-medium">On-chain record</h2>
            <div className="mt-3">
              <AttestationBlock a={p.attestation} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
