"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPostCheck, startFailureMessage } from "./api";
import { ADDRESS_0X, parseRepoInput } from "./format";
import { Preflight } from "./Preflight";
import { rememberCheck } from "./RecentChecks";
import { btnPrimary, inputCls } from "./ui";

const NODESCOPE = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";
const EXAMPLES = [
  { label: "A real exact match", hint: "NodeScope against its own contract", repo: "Firzadf/nodescope", address: NODESCOPE },
  {
    label: "A real code match",
    hint: "ReviveScope against its own contract",
    repo: "Gieez/portaldot-revivescope",
    address: "0xe0ba8adf0cd660f5875aca70a98e466f30855dec",
  },
  { label: "A false claim", hint: "ReviveScope's repo against NodeScope's contract", repo: "Gieez/portaldot-revivescope", address: NODESCOPE },
];

type Props = { initial: { repo: string; address: string; commit: string }; autoRun?: boolean };

export function CheckForm({ initial, autoRun = false }: Props) {
  const router = useRouter();
  const [repo, setRepo] = useState(initial.repo);
  const [address, setAddress] = useState(initial.address);
  const [commit, setCommit] = useState(initial.commit);
  const [showCommit, setShowCommit] = useState(!!initial.commit);
  const [errors, setErrors] = useState<{ repo?: string; address?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);

  async function start(input: { repo: string; address: string; commit: string }) {
    const parsed = parseRepoInput(input.repo);
    const addr = input.address.trim().toLowerCase();
    const next: typeof errors = {};
    if (!parsed) next.repo = "Use owner/name or a github.com link, for example Firzadf/nodescope.";
    if (!ADDRESS_0X.test(addr)) next.address = "A contract address is 0x followed by 40 characters.";
    setErrors(next);
    if (!parsed || next.address) return;

    setBusy(true);
    const ref = input.commit.trim();
    const r = await apiPostCheck({ repo: parsed.repo, address: addr, ...(ref ? { commit: ref } : {}) });
    if (r.ok) {
      rememberCheck({ id: r.data.id, repo: parsed.repo, address: addr });
      router.push(`/check/${r.data.id}`);
      return;
    }
    setBusy(false);
    setErrors({ form: startFailureMessage(r) });
  }

  // A link from the landing page starts the check straight away.
  useEffect(() => {
    if (!autoRun || ran.current) return;
    ran.current = true;
    void start(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeRepo(value: string) {
    setRepo(value);
    // A pasted link can name a commit. Keep it, so nobody has to find it twice.
    const ref = parseRepoInput(value)?.ref;
    if (ref) {
      setCommit(ref);
      setShowCommit(true);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void start({ repo, address, commit: showCommit ? commit : "" });
  }

  function runExample(ex: (typeof EXAMPLES)[number]) {
    if (busy) return;
    setRepo(ex.repo);
    setAddress(ex.address);
    setCommit("");
    setShowCommit(false);
    void start({ repo: ex.repo, address: ex.address, commit: "" });
  }

  return (
    <div>
      <form onSubmit={submit} noValidate className="space-y-5 border border-rule bg-surface p-4 sm:p-6">
        <div>
          <label htmlFor="repo" className="block font-medium">
            GitHub repo
          </label>
          <input
            id="repo"
            value={repo}
            onChange={(e) => changeRepo(e.target.value)}
            placeholder="owner/name or a GitHub link"
            autoComplete="off"
            spellCheck={false}
            autoFocus={!autoRun && !initial.repo}
            aria-invalid={errors.repo ? true : undefined}
            aria-describedby={errors.repo ? "repo-error" : undefined}
            className={`${inputCls} mt-1 bg-paper`}
          />
          {errors.repo && (
            <p id="repo-error" className="mt-1 text-sm text-bad">
              {errors.repo}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="address" className="block font-medium">
            Contract address
          </label>
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.address ? true : undefined}
            aria-describedby={errors.address ? "address-error" : undefined}
            className={`${inputCls} mt-1 bg-paper font-mono text-sm`}
          />
          {errors.address ? (
            <p id="address-error" className="mt-1 text-sm text-bad">
              {errors.address}
            </p>
          ) : (
            <Preflight address={address} />
          )}
        </div>

        {showCommit ? (
          <div id="commit-field">
            <label htmlFor="commit" className="block font-medium">
              Commit, tag or branch
            </label>
            <input
              id="commit"
              value={commit}
              onChange={(e) => setCommit(e.target.value)}
              placeholder="Leave empty for the default branch"
              autoComplete="off"
              spellCheck={false}
              className={`${inputCls} mt-1 bg-paper font-mono text-sm`}
            />
          </div>
        ) : null}

        {errors.form && (
          <p role="alert" className="border-l-4 border-bad bg-bad-bg px-4 py-3">
            {errors.form}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full sm:w-auto sm:min-w-40`}>
            {busy ? "Starting the check" : "Check"}
          </button>
          <button
            type="button"
            onClick={() => setShowCommit((s) => !s)}
            aria-expanded={showCommit}
            aria-controls="commit-field"
            className="min-h-11 text-accent underline"
          >
            {showCommit ? "Use the default branch" : "Check a specific commit"}
          </button>
        </div>
        <p className="text-sm text-muted">No wallet and no account. Most checks finish in under a minute.</p>
      </form>

      <section aria-labelledby="examples-title" className="mt-8">
        <h2 id="examples-title" className="font-serif text-xl font-medium">
          Nothing to check yet? Run a real one
        </h2>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {EXAMPLES.map((ex) => (
            <li key={ex.label}>
              <button
                type="button"
                onClick={() => runExample(ex)}
                disabled={busy}
                className="flex min-h-11 w-full flex-wrap items-baseline justify-between gap-x-4 py-3 text-left transition-colors hover:bg-ink/5 disabled:opacity-50"
              >
                <span>
                  <span className="block font-medium text-accent">{ex.label}</span>
                  <span className="block text-sm text-muted">{ex.hint}</span>
                </span>
                <span className="text-sm font-medium text-accent">Run it</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
