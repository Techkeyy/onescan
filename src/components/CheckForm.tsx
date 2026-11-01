"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiPostCheck, startFailureMessage } from "./api";
import { ADDRESS_0X, REPO_INPUT } from "./format";
import { btnPrimary, inputCls } from "./ui";

const EXAMPLES = [
  {
    label: "Try one: NodeScope",
    repo: "Firzadf/nodescope",
    address: "0xd48da7eff3264bdd51a86b873da9ff6997aae99c",
  },
  {
    label: "Try one: ReviveScope",
    repo: "Gieez/portaldot-revivescope",
    address: "0xe0ba8adf0cd660f5875aca70a98e466f30855dec",
  },
  {
    label: "Watch it refuse: ReviveScope repo, NodeScope contract",
    repo: "Gieez/portaldot-revivescope",
    address: "0xd48da7eff3264bdd51a86b873da9ff6997aae99c",
  },
];

export function CheckForm({ initial }: { initial: { repo: string; address: string; commit: string } }) {
  const router = useRouter();
  const [repo, setRepo] = useState(initial.repo);
  const [address, setAddress] = useState(initial.address);
  const [commit, setCommit] = useState(initial.commit);
  const [showCommit, setShowCommit] = useState(!!initial.commit);
  const [errors, setErrors] = useState<{ repo?: string; address?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!REPO_INPUT.test(repo.trim())) next.repo = "Use owner/name or a github.com link, for example Firzadf/nodescope.";
    if (!ADDRESS_0X.test(address.trim())) next.address = "A contract address is 0x followed by 40 characters.";
    setErrors(next);
    if (next.repo || next.address) return;

    setBusy(true);
    const r = await apiPostCheck({
      repo: repo.trim(),
      address: address.trim().toLowerCase(),
      ...(showCommit && commit.trim() ? { commit: commit.trim() } : {}),
    });
    if (r.ok) {
      router.push(`/check/${r.data.id}`);
      return;
    }
    setBusy(false);
    setErrors({ form: startFailureMessage(r) });
  }

  function fill(ex: (typeof EXAMPLES)[number]) {
    setRepo(ex.repo);
    setAddress(ex.address);
    setCommit("");
    setShowCommit(false);
    setErrors({});
  }

  return (
    <div>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <label htmlFor="repo" className="block font-medium">
            GitHub repo
          </label>
          <input
            id="repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/name or GitHub link"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.repo ? true : undefined}
            aria-describedby={errors.repo ? "repo-error" : undefined}
            className={`${inputCls} mt-1`}
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
            className={`${inputCls} mt-1 font-mono text-sm`}
          />
          {errors.address && (
            <p id="address-error" className="mt-1 text-sm text-bad">
              {errors.address}
            </p>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCommit((s) => !s)}
            aria-expanded={showCommit}
            aria-controls="commit-field"
            className="min-h-9 text-base text-accent underline"
          >
            Check a specific commit
          </button>
          {showCommit && (
            <div id="commit-field" className="mt-2">
              <label htmlFor="commit" className="block text-sm font-medium text-muted">
                Commit, tag or branch (leave empty for the default branch)
              </label>
              <input
                id="commit"
                value={commit}
                onChange={(e) => setCommit(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} mt-1 font-mono text-sm`}
              />
            </div>
          )}
        </div>

        {errors.form && (
          <p role="alert" className="border-l-4 border-bad bg-bad-bg px-4 py-3">
            {errors.form}
          </p>
        )}

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full sm:w-auto sm:min-w-40`}>
          {busy ? "Starting the check" : "Check"}
        </button>
      </form>

      <div className="mt-8 border-t border-rule pt-5">
        <p className="text-sm font-medium text-muted">Fill the form with a real example</p>
        <ul className="mt-2 space-y-1">
          {EXAMPLES.map((ex) => (
            <li key={ex.label}>
              <button
                type="button"
                onClick={() => fill(ex)}
                className="min-h-9 text-left text-base text-accent underline"
              >
                {ex.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          The last one pairs a repo with a contract that is not its own. OneScan should refuse it.
        </p>
      </div>
    </div>
  );
}
