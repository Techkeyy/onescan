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
      // @polkadot/api imports files the tracer misses, so it and its dependencies ship whole.
      "./node_modules/@polkadot/**/*",
      "./node_modules/@types/**/*",
      "./node_modules/@noble/**/*",
      "./node_modules/@substrate/**/*",
      "./node_modules/@scure/**/*",
      "./node_modules/@polkadot-api/**/*",
      "./node_modules/tslib/**/*",
      "./node_modules/undici-types/**/*",
      "./node_modules/bn.js/**/*",
      "./node_modules/rxjs/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/data-uri-to-buffer/**/*",
      "./node_modules/fetch-blob/**/*",
      "./node_modules/node-domexception/**/*",
      "./node_modules/web-streams-polyfill/**/*",
      "./node_modules/formdata-polyfill/**/*",
      "./node_modules/ws/**/*",
      "./node_modules/eventemitter3/**/*",
      "./node_modules/scale-ts/**/*",
      "./node_modules/smoldot/**/*",
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
