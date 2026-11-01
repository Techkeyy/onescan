"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Job, Stage, StageId, VerifyFailureReason } from "@/lib/types";
import { apiGet, apiPostCheck, startFailureMessage } from "./api";
import { githubCommitUrl } from "./format";
import { Field, Hash, Loading, Notice, Section, Stamp, btnPrimary, btnSecondary, inputCls, linkCls } from "./ui";

const STAGE_LABEL: Record<StageId, string> = {
  bytecode: "Reading the code on-chain",
  compiler: "Reading the compiler version",
  repo: "Fetching the repo",
  compile: "Compiling the source",
  compare: "Comparing the two",
};
const STAGE_ORDER: StageId[] = ["bytecode", "compiler", "repo", "compile", "compare"];
const STATE_WORD: Record<Stage["state"], string> = {
  pending: "Waiting",
  running: "Working",
  done: "Done",
  failed: "Failed",
};

export const FAILURE_COPY: Record<VerifyFailureReason, { title: string; body: string }> = {
  no_code: {
    title: "Nothing is deployed at this address",
    body: "The chain returned no code for this address. Check that it is a contract on the Portaldot V3 testnet and that all 42 characters were copied.",
  },
  not_evm: {
    title: "This contract is PolkaVM bytecode, which OneScan cannot check yet",
    body: "OneScan only compares Solidity contracts that run as EVM bytecode. Checking PolkaVM contracts is planned for later.",
  },
  no_compiler_metadata: {
    title: "This contract does not say which compiler built it",
    body: "OneScan reads the Solidity compiler version from metadata stored at the end of the deployed code. This contract has none, so there is no version to compile with.",
  },
  repo_not_found: {
    title: "That repo or commit could not be found",
    body: "Check the spelling of owner/name, and that the repo is public. If you entered a commit, tag or branch, check that it exists.",
  },
  repo_too_large: {
    title: "This repo is too large to check",
    body: "OneScan stops at a size limit to stay fast for everyone. Point it at a smaller repo or a branch that contains only the contract.",
  },
  no_solidity: {
    title: "This repo has no Solidity files",
    body: "OneScan looks for .sol files at the chosen commit and found none. Check that you picked the right repo and commit.",
  },
  compile_failed: {
    title: "The code did not compile",
    body: "OneScan compiled the repo with the compiler version found on-chain, and the compiler reported errors. The details below are the compiler's own words.",
  },
  inconclusive: {
    title: "The check ran out of time",
    body: "OneScan did not get through every combination it needed to try, so it cannot say whether the repo matches. This is not a negative verdict. Try again, or try a specific commit.",
  },
  unavailable: {
    title: "A service OneScan depends on could not be reached",
    body: "The chain, GitHub, the package registry or the compiler download did not answer. Nothing was decided about the repo. Try again in a minute.",
  },
  interrupted: {
    title: "The check was interrupted",
    body: "OneScan restarted while your check was running, so it never finished. Nothing was decided about the repo. Please submit the check again.",
  },
  internal_error: {
    title: "Something went wrong on our side",
    body: "The check hit an error inside OneScan. It is not a verdict on the repo. Please try again, and if it keeps happening, try a little later.",
  },
  no_match: {
    title: "This repo does not match this contract",
    body: "The repo compiled, but nothing in it produces the code running at this address.",
  },
};

function StageList({ stages }: { stages: Stage[] }) {
  const byId = new Map(stages.map((s) => [s.id, s]));
  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {STAGE_ORDER.map((id) => {
        const s = byId.get(id) ?? { id, state: "pending" as const };
        return (
          <li key={id} className="flex items-start gap-3 py-3">
            <span
              aria-hidden="true"
              className={`mt-2 inline-block size-2 shrink-0 rounded-full ${
                s.state === "done"
                  ? "bg-ok"
                  : s.state === "failed"
                    ? "bg-bad"
                    : s.state === "running"
                      ? "pulse bg-accent"
                      : "border border-muted"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="font-medium">{STAGE_LABEL[id]}</span>
                <span className={`text-sm ${s.state === "failed" ? "font-semibold text-bad" : "text-muted"}`}>
                  {STATE_WORD[s.state]}
                </span>
              </div>
              {s.detail && <p className="mt-1 break-words font-mono text-sm text-muted">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AnotherCommit({ job }: { job: Job }) {
  const router = useRouter();
  const [commit, setCommit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!commit.trim()) {
      setError("Enter a commit, tag or branch to try.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiPostCheck({ repo: job.input.repo, address: job.input.address, commit: commit.trim() });
    if (r.ok) {
      router.push(`/check/${r.data.id}`);
      return;
    }
    setBusy(false);
    setError(startFailureMessage(r));
  }

  return (
    <form onSubmit={submit} noValidate className="mt-2">
      <label htmlFor="another-commit" className="block font-medium">
        Try another commit, tag or branch
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="another-commit"
          value={commit}
          onChange={(e) => setCommit(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`${inputCls} font-mono text-sm`}
        />
        <button type="submit" disabled={busy} className={`${btnPrimary} sm:shrink-0`}>
          {busy ? "Starting" : "Check this commit"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function InputSummary({ job }: { job: Job }) {
  const { repo, commit, address } = job.input;
  return (
    <dl>
      <Field label="Repo">
        <a href={`https://github.com/${repo}`} className={linkCls} rel="noopener noreferrer">
          {repo}
        </a>
      </Field>
      <Field label="Commit">
        {commit ? (
          /^[0-9a-f]{40}$/i.test(commit) ? (
            <a href={githubCommitUrl(repo, commit)} className={`${linkCls} font-mono text-sm`} rel="noopener noreferrer">
              {commit.slice(0, 12)}
            </a>
          ) : (
            <code className="font-mono text-sm">{commit}</code>
          )
        ) : (
          "Default branch"
        )}
      </Field>
      <Field label="Contract">
        <Hash value={address} />
      </Field>
    </dl>
  );
}

export function CheckView({ id }: { id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [problem, setProblem] = useState<"notfound" | "network" | "server" | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const ac = new AbortController();

    async function tick() {
      const r = await apiGet<Job>(`/api/check/${encodeURIComponent(id)}`, ac.signal);
      if (stopped) return;
      if (r.ok) {
        setProblem(null);
        setJob(r.data);
        if (r.data.state === "matched") {
          router.replace(`/proof/${r.data.input.address}`);
          return;
        }
        if (r.data.state === "no_match" || r.data.state === "failed") return;
      } else if (r.status === 404) {
        setProblem("notfound");
        return;
      } else {
        setProblem(r.status === 0 ? "network" : "server");
      }
      timer = setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stopped = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [id, router]);

  if (problem === "notfound") {
    return (
      <div className="py-6">
        <Notice tone="warn" title="This check was not found" role="alert">
          <p>
            It may be older than the server remembers, or the link is wrong. If it matched, its proof page is kept
            and can be found by the contract address.
          </p>
        </Notice>
        <div className="mt-4">
          <Link href="/" className={btnSecondary}>
            Start a new check
          </Link>
        </div>
      </div>
    );
  }

  if (!job) {
    return problem ? (
      <div className="py-6">
        <Notice tone="warn" title="Could not reach OneScan, retrying" role="status">
          <p>Your check is not lost. This page keeps trying and will update when the server answers.</p>
        </Notice>
      </div>
    ) : (
      <Loading what="Looking up your check" />
    );
  }

  const active = job.state === "queued" || job.state === "running" || job.state === "matched";
  const failure = job.failure;

  return (
    <div>
      {active && (
        <>
          <h1 className="font-serif text-3xl font-medium sm:text-4xl">
            {job.state === "matched" ? "Match found. Opening the proof." : "Checking"}
          </h1>
          {job.state === "queued" && (
            <p className="mt-2 text-muted">Waiting in line. This page updates by itself.</p>
          )}
          {job.state === "matched" && (
            <p className="mt-2">
              <Link href={`/proof/${job.input.address}`} className={linkCls}>
                Open the proof page
              </Link>
            </p>
          )}
        </>
      )}

      {job.state === "no_match" && (
        <>
          <Stamp tone="neutral" kicker="Verdict" title="This repo does not match this contract">
            <p>
              OneScan compiled the repo and compared it with the code running at this address. They are not the same
              code.
            </p>
          </Stamp>
          <p className="mt-4 max-w-2xl">
            A different commit may be the reason. Contracts are often deployed from an earlier or later version of the
            repo than the one now on the default branch.
          </p>
        </>
      )}

      {job.state === "failed" && (
        <>
          <p className="text-sm font-medium text-bad">The check could not finish</p>
          <h1 className="mt-1 font-serif text-3xl font-medium leading-tight sm:text-4xl">
            {failure ? FAILURE_COPY[failure.reason].title : "The check stopped without a reason"}
          </h1>
          <p className="mt-3 max-w-2xl">
            {failure
              ? FAILURE_COPY[failure.reason].body
              : "OneScan did not report why. Try again, and if it repeats, the details below may help."}
          </p>
          <p className="mt-2 text-muted">This is not a verdict on the repo. It means no comparison was made.</p>
        </>
      )}

      {problem && (
        <div className="mt-4">
          <Notice tone="warn" role="status" title="Connection to OneScan dropped, retrying">
            What you see below may be a few seconds old.
          </Notice>
        </div>
      )}

      <Section title="What was checked">
        <InputSummary job={job} />
      </Section>

      <Section title="Stages">
        <StageList stages={job.stages} />
      </Section>

      {failure?.detail && (
        <Section title={job.state === "no_match" ? "What OneScan compared" : "Details"}>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border border-rule bg-surface p-3 font-mono text-sm">
            {failure.detail}
          </pre>
        </Section>
      )}

      {job.state === "no_match" && (
        <Section title="What you can do">
          <AnotherCommit job={job} />
          <p className="mt-4">
            <Link
              href={`/?repo=${encodeURIComponent(job.input.repo)}&address=${job.input.address}`}
              className={linkCls}
            >
              Check a different repo for this contract
            </Link>
          </p>
        </Section>
      )}

      {job.state === "failed" && (
        <div className="mt-8 flex flex-wrap gap-3">
          <RetryButton job={job} />
          <Link
            href={`/?repo=${encodeURIComponent(job.input.repo)}&address=${job.input.address}${
              job.input.commit ? `&commit=${encodeURIComponent(job.input.commit)}` : ""
            }`}
            className={btnSecondary}
          >
            Edit the inputs
          </Link>
        </div>
      )}
    </div>
  );
}

function RetryButton({ job }: { job: Job }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await apiPostCheck({ repo: job.input.repo, address: job.input.address, commit: job.input.commit });
    if (r.ok) {
      router.push(`/check/${r.data.id}`);
      return;
    }
    setBusy(false);
    setError(startFailureMessage(r));
  }
  return (
    <div>
      <button type="button" onClick={retry} disabled={busy} className={btnPrimary}>
        {busy ? "Starting" : "Check again"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
