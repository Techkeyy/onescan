import { getStore } from "@/lib/store";
import { liveStatus, normaliseAddress } from "../../api/_lib/util";

export const dynamic = "force-dynamic";

function svg(text: string, color: string) {
  const left = "OneScan";
  const w1 = 6 * left.length + 14;
  const w2 = Math.round(6.2 * text.length) + 14;
  const w = w1 + w2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${left}: ${text}">` +
    `<title>${left}: ${text}</title>` +
    `<rect width="${w1}" height="20" fill="#2b2b2b"/><rect x="${w1}" width="${w2}" height="20" fill="${color}"/>` +
    `<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">` +
    `<text x="${w1 / 2}" y="14">${left}</text><text x="${w1 + w2 / 2}" y="14">${text}</text></g></svg>`
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const address = normaliseAddress((await params).address);
  let body = svg("not checked", "#6b7280");
  let status = 200;
  if (!address) status = 400;
  else {
    const proof = getStore().getProof(address);
    if (proof) {
      const { live } = await liveStatus(address, proof.runtimeHash);
      if (live === "current") {
        body = proof.match.kind === "exact" ? svg("exact match", "#15803d") : svg("code matches", "#16a34a");
      } else if (live === "changed") body = svg("code changed", "#b45309");
      // live === "unknown": the match cannot be confirmed right now, so the badge does not claim it.
    }
  }
  return new Response(body, {
    status,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-cache, max-age=0" },
  });
}
