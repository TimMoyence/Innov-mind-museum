#!/usr/bin/env bash
set -euo pipefail

SHARD="${1:?Usage: maestro-run-shard.sh <shard_name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAESTRO_DIR="$(cd "$SCRIPT_DIR/../.maestro" && pwd)"
LOG_DIR="$MAESTRO_DIR/logs"
mkdir -p "$LOG_DIR"

if ! command -v jq > /dev/null 2>&1; then
  echo "[shard] jq is required — install via brew install jq" >&2
  exit 1
fi
if ! command -v maestro > /dev/null 2>&1; then
  echo "[shard] maestro CLI is required — see https://maestro.mobile.dev/" >&2
  exit 1
fi

if [ "$SHARD" = "all" ]; then
  FLOWS=$(jq -r '.shards[].flows[]' "$MAESTRO_DIR/shards.json")
elif [ "$SHARD" = "smoke" ]; then
  FLOWS=$(jq -r '.smoke[]' "$MAESTRO_DIR/shards.json")
elif [ "$SHARD" = "netshapeSmoke" ]; then
  FLOWS=$(jq -r '.netshapeSmoke[]' "$MAESTRO_DIR/shards.json")
else
  FLOWS=$(jq -r --arg s "$SHARD" '.shards[] | select(.name == $s) | .flows[]' "$MAESTRO_DIR/shards.json")
fi

if [ -z "$FLOWS" ]; then
  echo "[shard] no flows found for shard '$SHARD' — check shards.json" >&2
  exit 1
fi

FAIL_COUNT=0
echo "[shard:$SHARD] flows to run:"
echo "$FLOWS"

case "$SHARD" in
  auth | all)
    if (cd "$SCRIPT_DIR/../../museum-backend" &&
      E2E_SEED_ALLOW=1 E2E_LOGIN_EMAIL=apple.test@apple.com E2E_LOGIN_PASSWORD='Apple1234!' \
        pnpm seed:e2e-maestro-account); then
      echo "[shard:$SHARD] re-seeded apple.test@apple.com (auth-account-delete recovery)"
    else
      echo "[shard:$SHARD] WARN: apple.test re-seed failed — auth-login-happy may fail after auth-account-delete"
    fi
    ;;
esac

MAX_ATTEMPTS="${MAESTRO_FLOW_ATTEMPTS:-2}"

while IFS= read -r flow; do
  [ -z "$flow" ] && continue
  attempt=1
  passed=0
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    echo "[shard:$SHARD] running $flow (attempt $attempt/$MAX_ATTEMPTS)…"
    if maestro test --debug-output "$LOG_DIR/debug/${flow%.yaml}" "$MAESTRO_DIR/$flow" 2>&1 | tee "$LOG_DIR/${SHARD}-${flow%.yaml}.log"; then
      passed=1
      break
    fi
    echo "[shard:$SHARD] $flow attempt $attempt failed"
    attempt=$((attempt + 1))
  done
  if [ "$passed" -eq 1 ]; then
    echo "[shard:$SHARD] $flow PASS"
  else
    echo "[shard:$SHARD] $flow FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done <<< "$FLOWS"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "[shard:$SHARD] $FAIL_COUNT flow(s) failed."
  exit 1
fi

echo "[shard:$SHARD] all flows passed."
exit 0
