export function SiteFooter() {
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL;
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto w-full max-w-5xl space-y-1 px-4 py-6 text-sm text-muted">
        <p>OneScan is an independent tool. It is not affiliated with Portaldot.</p>
        <p>It reads the Portaldot V3 testnet only. Nothing here applies to a mainnet.</p>
        <p>
          Home illustration made with{" "}
          <a href="https://github.com/benjitaylor/skills" className="text-accent underline" rel="noopener noreferrer">
            Stageshow
          </a>{" "}
          by Benji Taylor (MIT)
        </p>
        {repoUrl && (
          <p>
            <a href={repoUrl} className="text-accent underline" rel="noopener noreferrer">
              Source code on GitHub
            </a>
          </p>
        )}
      </div>
    </footer>
  );
}
