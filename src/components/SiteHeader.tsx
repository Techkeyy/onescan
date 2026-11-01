import Link from "next/link";
import { SearchBox } from "./SearchBox";

function Seal() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="1" />
      <path d="M8.8 13.3l3 3 5.4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-accent no-underline">
          <Seal />
          <span className="font-serif text-2xl font-bold tracking-tight text-ink">OneScan</span>
        </Link>
        <nav className="flex items-center gap-4 text-base" aria-label="Main">
          <Link href="/proofs" className="text-ink hover:underline">
            Proofs
          </Link>
        </nav>
        <div className="w-full sm:ml-auto sm:w-auto sm:min-w-80">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
