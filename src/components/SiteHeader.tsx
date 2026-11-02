"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiveStatus } from "./LiveStatus";
import { SearchBox } from "./SearchBox";
import { Seal, btnPrimary } from "./ui";

const tab = (active: boolean) =>
  `inline-flex min-h-11 items-center border-b-2 px-1 text-base transition-colors ${
    active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
  }`;

export function SiteHeader() {
  const path = usePathname();
  const landing = path === "/";
  return (
    <header className={`top-0 z-20 border-b border-rule bg-paper ${landing ? "sticky" : "sm:sticky"}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-accent no-underline">
          <Seal />
          <span className="font-serif text-xl font-semibold text-ink">OneScan</span>
        </Link>
        {landing ? (
          <>
            <nav className="ml-auto hidden items-center gap-6 sm:flex" aria-label="Main">
              <a href="#how" className={tab(false)}>
                How it works
              </a>
              <Link href="/proofs" className={tab(false)}>
                Proofs
              </Link>
              <a href="#accounts" className={tab(false)}>
                Accounts
              </a>
            </nav>
            <Link href="/check" className={`${btnPrimary} ml-auto sm:ml-0`}>
              Check a contract
            </Link>
          </>
        ) : (
          <>
            <nav className="flex items-center gap-6" aria-label="Main">
              <Link href="/check" className={tab(path.startsWith("/check"))}>
                Check
              </Link>
              <Link href="/proofs" className={tab(path.startsWith("/proof"))}>
                Proofs
              </Link>
            </nav>
            <span className="ml-auto hidden lg:block">
              <LiveStatus />
            </span>
            <div className="w-full pb-1 sm:ml-auto sm:w-72 sm:pb-0 lg:ml-0">
              <SearchBox />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
