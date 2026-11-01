import { posix } from "node:path";
import { validateRepo } from "./github";

// ---------- parsing ----------

/** Remove // and /* *\/ comments, keeping string literals intact. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Import path strings of a Solidity source. */
export function parseImports(src: string): string[] {
  const clean = stripComments(src);
  const out: string[] = [];
  const re = /(?:^|[;{}\s])import\s+(?:[^;"']*?\bfrom\s+)?["']([^"']+)["']/g;
  for (const m of clean.matchAll(re)) out.push(m[1]);
  return out;
}

/** True if the file declares a deployable contract or library (not only interfaces / abstract contracts). */
export function declaresDeployable(src: string): boolean {
  const clean = stripComments(src);
  const re = /(?:^|[^\w$])(abstract\s+)?(contract|library)\s+[A-Za-z_$]/g;
  for (const m of clean.matchAll(re)) if (!m[1]) return true;
  return false;
}

// ---------- remappings ----------

export type Remapping = { context: string; prefix: string; target: string };

export function parseRemapping(s: string): Remapping | null {
  const eq = s.indexOf("=");
  if (eq <= 0) return null;
  let left = s.slice(0, eq).trim();
  const target = s.slice(eq + 1).trim();
  let context = "";
  const colon = left.indexOf(":");
  if (colon >= 0) { context = left.slice(0, colon); left = left.slice(colon + 1); }
  if (!left) return null;
  return { context, prefix: left, target };
}

/** Same rule as solc: context must prefix the importing file, longest prefix wins, later wins ties. */
export function applyRemappings(path: string, importer: string, remaps: Remapping[]): string {
  let best: Remapping | null = null;
  for (const r of remaps) {
    if (!path.startsWith(r.prefix)) continue;
    if (r.context && !importer.startsWith(r.context)) continue;
    if (!best || r.context.length > best.context.length ||
        (r.context.length === best.context.length && r.prefix.length >= best.prefix.length)) best = r;
  }
  return best ? best.target + path.slice(best.prefix.length) : path;
}

/** Source-unit name an import resolves to, or null if it escapes the root. */
export function resolveImportPath(imp: string, importer: string, remaps: Remapping[]): string | null {
  let p: string;
  if (imp.startsWith("./") || imp.startsWith("../")) {
    p = posix.normalize(posix.join(posix.dirname(importer), imp));
    if (p.startsWith("../") || p === "..") return null;
  } else {
    p = posix.normalize(imp);
    if (imp.startsWith("/") || p.startsWith("../")) return null;
  }
  return applyRemappings(p, importer, remaps);
}

// ---------- git submodules ----------

export type Submodule = { path: string; repo: string; branch: string | null };

export function parseGitmodules(text: string): Submodule[] {
  const out: Submodule[] = [];
  let cur: { path?: string; url?: string; branch?: string } | null = null;
  const flush = () => {
    if (cur?.path && cur.url) {
      const m = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(cur.url.trim());
      if (m && validateRepo(m[1])) out.push({ path: cur.path.replace(/\/+$/, ""), repo: m[1], branch: cur.branch && /^[\w./-]+$/.test(cur.branch) ? cur.branch : null });
    }
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[submodule")) { flush(); cur = {}; continue; }
    const kv = /^(path|url|branch)\s*=\s*(.+)$/.exec(line);
    if (kv && cur) (cur as Record<string, string>)[kv[1]] = kv[2].trim();
  }
  flush();
  return out;
}

/** Foundry-style automatic remappings for submodules under lib/ that have the @scope/pkg shape. */
export function autoRemappings(subs: Submodule[], existing: Remapping[]): Remapping[] {
  const out: Remapping[] = [];
  for (const s of subs) {
    const base = s.path.split("/").pop() ?? "";
    const m = /^([a-z0-9]+)-(contracts[a-z-]*)$/.exec(base);
    if (m) {
      const prefix = `@${m[1]}/${m[2]}/`;
      if (!existing.some((r) => r.prefix === prefix)) out.push({ context: "", prefix, target: `${s.path}/contracts/` });
    }
    const plain = `${base}/`;
    if (s.path.startsWith("lib/") && !existing.some((r) => r.prefix === plain)) out.push({ context: "", prefix: plain, target: `${s.path}/` });
  }
  return out;
}

// ---------- npm ----------

const PKG = /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;

/** "@scope/pkg/rest" or "pkg/rest" to { pkg, rest }. */
export function splitPackagePath(key: string): { pkg: string; rest: string } | null {
  const segs = key.split("/");
  const n = segs[0].startsWith("@") ? 2 : 1;
  if (segs.length <= n) return null;
  const pkg = segs.slice(0, n).join("/");
  const rest = segs.slice(n).join("/");
  if (!PKG.test(pkg) || rest.split("/").some((s) => s === ".." || s === "." || s === "")) return null;
  return { pkg, rest };
}

/** Exact version from a package.json range like "^4.9.3" -> "4.9.3". */
export function cleanVersion(range: string): string | null {
  const m = /^[\^~=v\s]*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/.exec(range);
  return m ? m[1] : null;
}

/** Versions: package-lock.json first, then package.json. Shallower files take priority. */
export function collectPackageVersions(
  files: { path: string; text: string }[],
): Map<string, string> {
  const lock = new Map<string, string>();
  const pkg = new Map<string, string>();
  const sorted = [...files].sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  for (const f of sorted) {
    let json: unknown;
    try { json = JSON.parse(f.text); } catch { continue; }
    if (!json || typeof json !== "object") continue;
    const j = json as Record<string, unknown>;
    if (f.path.endsWith("package-lock.json")) {
      const pk = j.packages as Record<string, { version?: string }> | undefined;
      if (pk) for (const [k, v] of Object.entries(pk)) {
        const m = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(k);
        if (m && v?.version && !k.slice(0, k.length - m[0].length).includes("node_modules") && !lock.has(m[1])) lock.set(m[1], v.version);
      }
      const dep = j.dependencies as Record<string, { version?: string }> | undefined;
      if (dep) for (const [k, v] of Object.entries(dep)) if (v?.version && !lock.has(k)) lock.set(k, v.version);
    } else {
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        const d = j[field] as Record<string, string> | undefined;
        if (d) for (const [k, v] of Object.entries(d)) {
          const c = typeof v === "string" ? cleanVersion(v) : null;
          if (c && !pkg.has(k)) pkg.set(k, c);
          else if (!pkg.has(k) && typeof v === "string") pkg.set(k, "");
        }
      }
    }
  }
  const out = new Map<string, string>();
  for (const [k, v] of pkg) out.set(k, v); // "" = declared but no exact version
  for (const [k, v] of lock) out.set(k, v);
  return out;
}

/** URL to fetch a source unit that is not in the repo itself, or null when it cannot be one. */
export function externalUrl(key: string, subs: Submodule[], versions: Map<string, string>): string | null {
  for (const s of subs) {
    if (key.startsWith(s.path + "/")) {
      const rest = key.slice(s.path.length + 1);
      if (rest.split("/").some((x) => x === ".." || x === "." || x === "")) return null;
      const ref = s.branch ?? "HEAD";
      return `https://raw.githubusercontent.com/${s.repo}/${ref}/${rest}`;
    }
  }
  let k = key;
  if (k.startsWith("node_modules/")) k = k.slice("node_modules/".length);
  else if (!k.startsWith("@") && !versions.has(k.split("/")[0])) return null;
  const sp = splitPackagePath(k);
  if (!sp) return null;
  const v = versions.get(sp.pkg);
  const ver = v && /^[0-9A-Za-z.+-]+$/.test(v) ? v : "latest";
  return `https://cdn.jsdelivr.net/npm/${sp.pkg}@${ver}/${sp.rest}`;
}
