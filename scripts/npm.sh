#!/usr/bin/env bash
# Run npm from inside WSL. Required because LiteSVM ships no native Windows
# binding; the linux-x64-gnu optional dependency only resolves under Linux.
# Usage: bash scripts/npm.sh install
#        bash scripts/npm.sh test
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

exec npm "$@"
