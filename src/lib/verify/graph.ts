import { parseImports, resolveImportPath, externalSource, type Remapping, type Submodule } from "./imports";

export type Graph = {
  /** Every source unit found (repo files and fetched dependencies), by solc source-unit name. */
  sources: Map<string, string>;
  /** key -> source units it imports. */
  edges: Map<string, string[]>;
  /** key -> import strings that could not be found. */
  missing: Map<string, string[]>;
  /** key -> why this fetched dependency is not known to be the repo's pinned version. */
  guesses: Map<string, string>;
};

const MAX_EXTERNAL = 600;
const CONCURRENCY = 8;

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function buildGraph(o: {
  repoFiles: Map<string, string>;
  roots: string[];
  remaps: Remapping[];
  subs: Submodule[];
  versions: Map<string, string>;
  pinnedPkgs?: Set<string>;
  fetchText: (url: string) => Promise<string | null>;
}): Promise<Graph> {
  const sources = new Map<string, string>();
  const edges = new Map<string, string[]>();
  const missing = new Map<string, string[]>();
  const guesses = new Map<string, string>();
  const loads = new Map<string, Promise<string | null>>();
  let external = 0;

  const load = (key: string): Promise<string | null> => {
    let p = loads.get(key);
    if (!p) {
      const local = o.repoFiles.get(key);
      if (local !== undefined) p = Promise.resolve(local);
      else {
        const src = externalSource(key, o.subs, o.versions, o.pinnedPkgs ?? new Set());
        if (!src || external >= MAX_EXTERNAL) p = Promise.resolve(null);
        else {
          external++;
          if (src.guess) guesses.set(key, src.guess);
          p = o.fetchText(src.url);
        }
      }
      loads.set(key, p);
    }
    return p;
  };

  const seen = new Set<string>();
  let frontier = o.roots.filter((r) => o.repoFiles.has(r));
  for (const r of frontier) seen.add(r);

  while (frontier.length) {
    const next: string[] = [];
    await pool(frontier, CONCURRENCY, async (key) => {
      const text = await load(key);
      if (text === null) return;
      sources.set(key, text);
      const targets: string[] = [];
      const gone: string[] = [];
      for (const imp of parseImports(text)) {
        const t = resolveImportPath(imp, key, o.remaps);
        if (!t) { gone.push(imp); continue; }
        if ((await load(t)) === null) { gone.push(imp); continue; }
        targets.push(t);
        if (!seen.has(t)) { seen.add(t); next.push(t); }
      }
      edges.set(key, targets);
      if (gone.length) missing.set(key, gone);
    });
    frontier = next;
  }
  return { sources, edges, missing, guesses };
}

/** Source units reachable from a root, and the import strings missing along the way. */
export function closureOf(g: Graph, root: string): { keys: string[]; missing: string[]; guesses: string[] } {
  const keys: string[] = [];
  const miss: string[] = [];
  const guessed = new Set<string>();
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const k = stack.pop() as string;
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
    const why = g.guesses.get(k);
    if (why) guessed.add(why);
    for (const m of g.missing.get(k) ?? []) miss.push(`${k} imports ${m}`);
    for (const t of g.edges.get(k) ?? []) stack.push(t);
  }
  return { keys, missing: miss, guesses: [...guessed] };
}
