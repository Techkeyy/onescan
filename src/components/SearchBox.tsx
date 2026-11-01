"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiGet } from "./api";
import { ADDRESS_0X, ADDRESS_SS58 } from "./format";
import { inputCls } from "./ui";

export function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = value.trim();
    if (!ADDRESS_0X.test(v) && !ADDRESS_SS58.test(v)) {
      setError("Enter a 0x address or a 5... address.");
      return;
    }
    setError(null);
    if (ADDRESS_0X.test(v)) {
      setBusy(true);
      const r = await apiGet(`/api/proof/${v.toLowerCase()}`);
      setBusy(false);
      if (r.ok) {
        router.push(`/proof/${v.toLowerCase()}`);
        return;
      }
    }
    router.push(`/address/${v}`);
  }

  return (
    <form onSubmit={submit} role="search" className="w-full">
      <label htmlFor="site-search" className="sr-only">
        Look up an address
      </label>
      <div className="flex gap-2">
        <input
          id="site-search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Look up an address"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "site-search-error" : undefined}
          className={`${inputCls} font-mono text-sm`}
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 shrink-0 rounded-lg border border-ink/40 px-4 text-base font-medium transition-colors hover:bg-ink/5 disabled:opacity-50"
        >
          {busy ? "Looking" : "Look up"}
        </button>
      </div>
      {error && (
        <p id="site-search-error" role="alert" className="mt-1 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
