#!/usr/bin/env bash
# Report the authoritative program ID (from the deploy keypair) alongside the
# IDs currently declared in source and Anchor.toml, so drift is obvious.
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

echo "=== deploy keypair pubkey (authoritative) ==="
solana address -k target/deploy/circuit-keypair.json

echo "=== declare_id! in lib.rs ==="
grep -n 'declare_id' programs/circuit/src/lib.rs

echo "=== Anchor.toml ==="
grep -n 'circuit = ' Anchor.toml

echo "=== solana config ==="
solana config get 2>/dev/null | sed -n '1,6p'
