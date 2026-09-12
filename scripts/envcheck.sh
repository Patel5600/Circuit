#!/usr/bin/env bash
# Report the WSL-side Node/npm toolchain, used for running the LiteSVM suite
# (LiteSVM ships no native Windows binding, only linux/darwin + wasm).
export PATH="/usr/bin:/usr/sbin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$HOME/.cargo/bin:$PATH"

echo "=== which ==="
command -v node || echo "node: MISSING"
command -v npm || echo "npm: MISSING"

echo "=== versions ==="
node --version 2>/dev/null || true
npm --version 2>/dev/null || true

echo "=== nvm installs ==="
ls -1 "$HOME/.nvm/versions/node" 2>/dev/null || echo "no nvm"

echo "=== distro ==="
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
