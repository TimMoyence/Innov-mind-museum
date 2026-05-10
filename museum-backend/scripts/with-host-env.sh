#!/usr/bin/env bash
# Sources museum-backend/.env.host-mode (if present) so DB_HOST/DB_PORT point at
# the docker-compose-exposed host port (localhost:5433) instead of the in-network
# value (db:5432). Then execs the rest of the args. Used by migration:*:host /
# catalog-ingest scripts that run outside the Docker network.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
HOST_ENV="$ROOT_DIR/.env.host-mode"

if [ -f "$HOST_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HOST_ENV"
  set +a
fi

exec "$@"
