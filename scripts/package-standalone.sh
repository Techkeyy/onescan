#!/usr/bin/env bash
# Packs the `next build` standalone output into app.tgz for a server, without local data.
# -L matters: the build links external packages, and Windows cannot copy those links as links.
set -euo pipefail

out="${1:?usage: package-standalone.sh <empty output folder>}"
mkdir -p "$out/app"
cp -rL .next/standalone/. "$out/app/"
rm -rf "$out/app/data" "$out/app/src" "$out/app/scripts" "$out/app/docs" "$out/app/contracts" \
  "$out/app/.next/cache" "$out/app/node_modules/@img" "$out/app/tsconfig.tsbuildinfo"
rm -f "$out/app"/*.md
mkdir -p "$out/app/.next/static"
cp -r .next/static/. "$out/app/.next/static/"
[ -d public ] && cp -r public "$out/app/"
(cd "$out" && tar czf app.tgz -C app .)
ls -la "$out/app.tgz"
