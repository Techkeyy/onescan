// The public address. Every request passes through to the OneScan server, with the visitor's
// address and a shared secret so the rate limit still applies per visitor.
import { ipAddress, rewrite } from "@vercel/functions";

const ORIGIN = "https://onescan.103-195-188-198.sslip.io";

export const config = { matcher: "/:path*" };

export default function middleware(request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("x-onescan-client", ipAddress(request) ?? "unknown");
  headers.set("x-onescan-proxy", process.env.ONESCAN_PROXY_SECRET ?? "");
  return rewrite(new URL(url.pathname + url.search, ORIGIN), { request: { headers } });
}
