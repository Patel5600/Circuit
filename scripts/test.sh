#!/usr/bin/env bash
# Run the TypeScript integration suite under WSL.
#
# Runs on the Linux side because the SVM harness ships no native Windows
# binding. BPF_OUT_DIR tells solana-program-test where to find circuit.so.
#
# Usage: bash scripts/test.sh                    # whole suite
#        bash scripts/test.sh tests/smoke.ts     # one file
#        bash scripts/test.sh tests/circuit.ts 60000
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

export BPF_OUT_DIR="$(pwd)/target/deploy"
export SBF_OUT_DIR="$(pwd)/target/deploy"

TARGET="${1:-tests/**/*.ts}"
TIMEOUT="${2:-120000}"

exec npx ts-mocha -p ./tsconfig.json -t "$TIMEOUT" "$TARGET"
