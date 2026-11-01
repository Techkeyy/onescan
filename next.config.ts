import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["solc", "tar", "@polkadot/api"],
  // The compile worker loads solc at runtime, out of the bundler's sight.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/solc/**/*",
      "./node_modules/command-exists/**/*",
      "./node_modules/commander/**/*",
      "./node_modules/follow-redirects/**/*",
      "./node_modules/js-sha3/**/*",
      "./node_modules/memorystream/**/*",
      "./node_modules/semver/**/*",
      "./node_modules/tmp/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/api/**": ["./data/**/*", "./contracts/**/*", "./*.log", "./*.sh", "./director*.md"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
