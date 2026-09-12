#!/usr/bin/env bash
# Typecheck, then build, then report the landing critical path.
#
# Run:  wsl bash app/scripts/check.sh [--build]
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo "== typecheck =="
npx tsc --noEmit -p tsconfig.json
ts=$?
if [ $ts -ne 0 ]; then
  echo "typecheck FAILED ($ts)"
  exit $ts
fi
echo "typecheck ok"

if [ "${1:-}" != "--build" ]; then
  exit 0
fi

echo
echo "== build =="
start=$(date +%s)
npx vite build 2>&1 | tail -24
echo "build took $(( $(date +%s) - start ))s"

echo
echo "== landing critical path =="
cd dist/assets || exit 1
for f in Landing-*.js index-*.js; do
  case "$f" in *.css) continue;; esac
  three=$(grep -c 'BufferGeometry\|WebGLRenderer' "$f")
  web3=$(grep -c 'PublicKey' "$f")
  printf '  %-28s %8s bytes  three=%s  web3=%s\n' "$f" "$(wc -c < "$f")" "$three" "$web3"
done
echo "  total js: $(cat ./*.js | wc -c) bytes across $(ls ./*.js | wc -l) chunks"
