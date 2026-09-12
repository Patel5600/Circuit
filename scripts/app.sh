#!/usr/bin/env bash
# Frontend helper: run the app's toolchain under WSL.
# Usage: bash scripts/app.sh [install|typecheck|build|dev]
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/../app"

case "${1:-build}" in
  install)   npm install --no-audit --no-fund ;;
  typecheck) npx tsc --noEmit; echo "typecheck exit=$?" ;;
  build)
    npx vite build > /tmp/vite-build.log 2>&1
    code=$?
    echo "build exit=$code"
    echo "--- errors ---"
    grep -Ei '^(error|\[vite\]|Could not resolve|Transform failed)' /tmp/vite-build.log || echo "none"
    echo "--- output ---"
    grep -E 'dist/|modules transformed|built in' /tmp/vite-build.log || true
    exit $code
    ;;
  dev)       npx vite ;;
  *)         echo "usage: bash scripts/app.sh [install|typecheck|build|dev]" >&2; exit 2 ;;
esac
