#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HOST_ENV="$ROOT_DIR/.env.host-mode"

if [ -f "$HOST_ENV" ]; then
  set -a
  . "$HOST_ENV"
  set +a
fi

exec "$@"
