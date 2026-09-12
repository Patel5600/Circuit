#!/usr/bin/env bash
set -e
export PATH="/usr/bin:/usr/sbin:/usr/local/bin:/home/SPARROW/.avm/bin:/home/SPARROW/.cargo/bin:/home/SPARROW/.local/share/solana/install/active_release/bin:$PATH"
exec "$@"
