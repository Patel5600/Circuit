#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."
anchor build
