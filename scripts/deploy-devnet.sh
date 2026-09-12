#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-command devnet deploy + bootstrap, run entirely inside WSL.
#
# Why this exists: the Solana CLI, Anchor and the funded keypairs all live in
# WSL. Running the npm scripts from Windows PowerShell resolves "~" to the
# Windows home directory and cannot see the keypair, so every keypair-dependent
# step fails. This script keeps the whole flow on the Linux side.
#
# It uses a DEDICATED deployer keypair and never touches `solana config`, so
# your existing default identity is left exactly as it was.
#
# Usage:
#   wsl bash scripts/deploy-devnet.sh            # full flow
#   wsl bash scripts/deploy-devnet.sh --status   # report only, change nothing
#   wsl bash scripts/deploy-devnet.sh --sweep    # also move SOL from the old key
# ---------------------------------------------------------------------------
set -uo pipefail

export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

CLUSTER_URL="https://api.devnet.solana.com"
DEPLOYER="$HOME/.config/solana/circuit-deployer.json"
OLD_KEY="$HOME/.config/solana/id.json"
PROGRAM_SO="target/deploy/circuit.so"
PROGRAM_KEYPAIR="target/deploy/circuit-keypair.json"

STATUS_ONLY=0
SWEEP=0
for a in "$@"; do
  case "$a" in
    --status) STATUS_ONLY=1 ;;
    --sweep)  SWEEP=1 ;;
  esac
done

say()  { printf '\n\033[1m== %s\033[0m\n' "$1"; }
info() { printf '   %s\n' "$1"; }
die()  { printf '\n\033[31mFAILED:\033[0m %s\n' "$1" >&2; exit 1; }

# -- 0. toolchain -----------------------------------------------------------
say "Toolchain"
for bin in solana solana-keygen anchor node; do
  command -v "$bin" >/dev/null 2>&1 || die "$bin not found on PATH inside WSL"
  info "$bin -> $(command -v "$bin")"
done

[ -f "$PROGRAM_SO" ] || die "$PROGRAM_SO missing. Run: wsl bash scripts/build.sh anchor"
[ -f "$PROGRAM_KEYPAIR" ] || die "$PROGRAM_KEYPAIR missing"

PROGRAM_ID="$(solana address -k "$PROGRAM_KEYPAIR")"
DECLARED="$(grep -oP '(?<=declare_id!\(")[^"]+' programs/circuit/src/lib.rs)"
info "program id (keypair) : $PROGRAM_ID"
info "declare_id! in lib.rs: $DECLARED"
[ "$PROGRAM_ID" = "$DECLARED" ] || die "program id mismatch; rebuild after syncing declare_id!"

SO_SIZE=$(stat -c%s "$PROGRAM_SO")
info "artifact             : ${SO_SIZE} bytes"

# -- 1. deployer identity ---------------------------------------------------
say "Deployer identity"

if [ -f "$DEPLOYER" ]; then
  info "reusing $DEPLOYER"
else
  if [ "$STATUS_ONLY" = "1" ]; then
    info "no dedicated deployer yet (would be created)"
  else
    info "creating a fresh deployer keypair"
    # A fresh key is required: the previous identity's secret was committed to
    # git history, so it must never hold upgrade authority.
    solana-keygen new --no-bip39-passphrase --silent -o "$DEPLOYER" \
      || die "could not create $DEPLOYER"
  fi
fi

if [ -f "$DEPLOYER" ]; then
  DEPLOYER_ADDR="$(solana address -k "$DEPLOYER")"
  info "deployer address     : $DEPLOYER_ADDR"
else
  DEPLOYER_ADDR=""
fi

if [ -f "$OLD_KEY" ]; then
  info "previous identity    : $(solana address -k "$OLD_KEY") (compromised, not used)"
fi

# -- 2. balance -------------------------------------------------------------
say "Funding"

bal_sol() { solana balance -k "$1" --url "$CLUSTER_URL" 2>/dev/null | awk '{print $1}'; }

need_sol() { awk -v b="$1" 'BEGIN { print (b < 3.0) ? 1 : 0 }'; }

BAL="$(bal_sol "$DEPLOYER")"
BAL="${BAL:-0}"
info "deployer balance     : ${BAL} SOL"
info "needed for deploy    : ~2.6 SOL (rent for ${SO_SIZE} bytes + fees)"

if [ "$STATUS_ONLY" = "1" ]; then
  say "Status only; stopping here."
  exit 0
fi

if [ "$(need_sol "$BAL")" = "1" ]; then
  info "requesting airdrops from the devnet faucet"
  for i in 1 2 3; do
    solana airdrop 2 "$DEPLOYER_ADDR" --url "$CLUSTER_URL" >/dev/null 2>&1 \
      && info "airdrop $i ok" \
      || info "airdrop $i refused (faucet limit)"
    sleep 3
    BAL="$(bal_sol "$DEPLOYER")"; BAL="${BAL:-0}"
    [ "$(need_sol "$BAL")" = "0" ] && break
  done
  info "balance now          : ${BAL} SOL"
fi

# The old identity holds devnet SOL. Sweeping it is both a funding shortcut and
# good hygiene, since that key is publicly known and its balance is at risk.
if [ "$(need_sol "$BAL")" = "1" ] && [ "$SWEEP" = "1" ] && [ -f "$OLD_KEY" ]; then
  OLD_BAL="$(bal_sol "$OLD_KEY")"; OLD_BAL="${OLD_BAL:-0}"
  info "sweeping from the old identity (balance ${OLD_BAL} SOL)"
  MOVE="$(awk -v b="$OLD_BAL" 'BEGIN { v = b - 0.02; if (v < 0) v = 0; printf "%.4f", v }')"
  if awk -v m="$MOVE" 'BEGIN { exit (m > 0.1) ? 0 : 1 }'; then
    solana transfer "$DEPLOYER_ADDR" "$MOVE" \
      --from "$OLD_KEY" --fee-payer "$OLD_KEY" \
      --allow-unfunded-recipient --url "$CLUSTER_URL" >/dev/null 2>&1 \
      && info "transferred ${MOVE} SOL" \
      || info "transfer failed"
    BAL="$(bal_sol "$DEPLOYER")"; BAL="${BAL:-0}"
    info "balance now          : ${BAL} SOL"
  fi
fi

if [ "$(need_sol "$BAL")" = "1" ]; then
  cat <<EOF

Not enough SOL to deploy (have ${BAL}, need ~2.6).
Options:
  - Web faucet: https://faucet.solana.com/  (address ${DEPLOYER_ADDR})
  - Re-run later; faucet limits are per-IP and per-address
  - Re-run with --sweep to move devnet SOL off the old compromised key
EOF
  exit 1
fi

# -- 3. deploy --------------------------------------------------------------
say "Deploying program"

if solana program show "$PROGRAM_ID" --url "$CLUSTER_URL" >/dev/null 2>&1; then
  info "program already deployed; upgrading"
else
  info "first deployment"
fi

anchor deploy \
  --provider.cluster "$CLUSTER_URL" \
  --provider.wallet "$DEPLOYER" \
  || die "anchor deploy failed"

say "Verifying deployment"
solana program show "$PROGRAM_ID" --url "$CLUSTER_URL" | sed -n '1,8p' \
  || die "program not found after deploy"

# -- 4. bootstrap -----------------------------------------------------------
say "Initializing protocol (setup-devnet)"

DEPLOYER_KEYPAIR="$DEPLOYER" \
VITE_RPC_URL="$CLUSTER_URL" \
VITE_CLUSTER="devnet" \
  npx ts-node scripts/setup-devnet.ts || die "setup-devnet failed"

say "Done"
cat <<EOF
   Program:  $PROGRAM_ID
   Deployer: $DEPLOYER_ADDR

   Copy the VITE_ block printed above into app/.env.local, then restart the dev
   server and hard-reload the browser.
EOF
