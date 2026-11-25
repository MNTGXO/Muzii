#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
for test in ../tests/*.test.ts tests/*.test.ts tests/*.test.tsx; do
  echo "Testing $test"
  ./node_modules/.bin/esbuild "$test" --bundle --platform=node --format=cjs --jsx=automatic \
    --external:react --external:react/jsx-runtime --external:react-test-renderer \
    --define:import.meta.env.VITE_API_BASE_URL='""' --outfile="$tmp_dir/test.cjs" >/dev/null
  NODE_PATH="$PWD/node_modules" node "$tmp_dir/test.cjs"
done
