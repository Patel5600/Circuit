#!/usr/bin/env bash
# Devnet preflight: deployer identity, balance, program state, artifact size.
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

PROGRAM_ID="$(grep -oP '(?<=declare_id!\(")[^"]+' programs/circuit/src/lib.rs)"

echo "=== cluster ==="
solana config get 2>/dev/null | grep -E 'RPC URL|Keypair Path'

echo "=== deployer ==="
solana address
echo "balance: $(solana balance 2>&1)"

echo "=== program id ==="
echo "$PROGRAM_ID"

echo "=== deploy artifact ==="
if [ -f target/deploy/circuit.so ]; then
  ls -la target/deploy/circuit.so | awk '{print $5" bytes  "$9}'
  # Rent for a program account is roughly 2x the binary size in lamports terms;
  # report the minimum balance solana would require for the data length.
  echo "min rent-exempt for $(stat -c%s target/deploy/circuit.so) bytes:"
  solana rent "$(stat -c%s target/deploy/circuit.so)" 2>&1 | head -3
else
  echo "MISSING - run: bash scripts/build.sh anchor"
fi

echo "=== on-chain program state ==="
solana program show "$PROGRAM_ID" 2>&1 | head -10
