import Link from "next/link";

export function SiteFooter() {
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL;
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 text-sm text-muted sm:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-1">
          <p>OneScan is an independent tool. It is not affiliated with Portaldot.</p>
          <p>It reads the Portaldot V3 testnet only. Nothing here applies to a mainnet.</p>
          <p>
            Illustration made with{" "}
            <a href="https://github.com/benjitaylor/skills" className="text-accent underline" rel="noopener noreferrer">
              Stageshow
            </a>{" "}
            by Benji Taylor (MIT)
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-1 sm:justify-end" aria-label="Footer">
          <Link href="/check" className="text-accent underline">
            Check a contract
          </Link>
          <Link href="/proofs" className="text-accent underline">
            Proofs
          </Link>
          {repoUrl && (
            <a href={repoUrl} className="text-accent underline" rel="noopener noreferrer">
              Source code
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
