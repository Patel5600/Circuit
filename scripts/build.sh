#!/usr/bin/env bash
# Convenience wrapper: run the Solana/Anchor toolchain from WSL with the
# correct PATH. Usage:  bash scripts/build.sh [sbf|anchor|test]
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

cd "$(dirname "$0")/.."

MODE="${1:-sbf}"

case "$MODE" in
  sbf)
    cargo build-sbf --manifest-path programs/circuit/Cargo.toml
    ;;
  anchor)
    anchor build
    ;;
  test)
    cargo test --manifest-path programs/circuit/Cargo.toml --lib
    ;;
  *)
    echo "usage: bash scripts/build.sh [sbf|anchor|test]" >&2
    exit 2
    ;;
esac
