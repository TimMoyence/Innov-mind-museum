#!/usr/bin/env bats
# Phase 2 — Tests for maestro-run-shard.sh shard parsing.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/maestro-run-shard.sh"
  TMPDIR_TEST="$(mktemp -d)"
  mkdir -p "$TMPDIR_TEST/.maestro"
  cat > "$TMPDIR_TEST/.maestro/shards.json" <<JSON
{
  "shards": [
    { "name": "auth",     "flows": ["x.yaml", "y.yaml"] },
    { "name": "chat",     "flows": ["z.yaml"] }
  ],
  "iosNightly": "all",
  "excluded": []
}
JSON
}

teardown() {
  rm -rf "$TMPDIR_TEST"
}

@test "fails fast when no shard name is provided" {
  run bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "Usage:" ]]
}

@test "fails fast on unknown shard name" {
  # use mocked maestro CLI to skip the actual run
  PATH="$TMPDIR_TEST/bin:$PATH"
  mkdir -p "$TMPDIR_TEST/bin"
  echo '#!/usr/bin/env bash' > "$TMPDIR_TEST/bin/maestro"
  echo 'exit 0' >> "$TMPDIR_TEST/bin/maestro"
  chmod +x "$TMPDIR_TEST/bin/maestro"

  # also stub jq + script's MAESTRO_DIR resolution
  # The script resolves .maestro relative to itself; we only sanity-check the
  # error path — real execution covered by GH Actions integration.
  run bash "$SCRIPT" definitely-not-a-shard
  [ "$status" -ne 0 ]
}
