#!/bin/bash
# trace.sh — POSIX helper that posts a Langfuse span via curl.
# V12 W1 §3 — /team agent dispatch + gate verdict telemetry.
#
# Sourced by team-hooks/* + dispatcher to emit spans without coupling to
# Node/TS infra. Fail-open: if Langfuse is unreachable, slow, or env vars
# missing, the calling pipeline continues silently.
#
# Env (read at call time):
#   LANGFUSE_PUBLIC_KEY  — pk-lf-...
#   LANGFUSE_SECRET_KEY  — sk-lf-...
#   LANGFUSE_HOST        — http://localhost:3002 (default)
#   LANGFUSE_ENABLED     — must be "true" to emit (default off)
#
# Usage:
#   source .claude/skills/team/lib/trace.sh
#   trace_span "agent.dispatch" "$RUN_ID" "$AGENT_NAME" "$VERDICT" "$DURATION_MS"

# shellcheck shell=bash

# trace_span <name> <run_id> <agent> <verdict> <duration_ms>
# Returns 0 unconditionally (fail-open).
trace_span() {
  local name="${1:-unnamed}"
  local run_id="${2:-unknown}"
  local agent="${3:-unknown}"
  local verdict="${4:-N/A}"
  local duration_ms="${5:-0}"

  # Bail on any missing precondition
  [ "${LANGFUSE_ENABLED:-false}" = "true" ] || return 0
  [ -n "${LANGFUSE_PUBLIC_KEY:-}" ] || return 0
  [ -n "${LANGFUSE_SECRET_KEY:-}" ] || return 0
  command -v curl &>/dev/null || return 0
  command -v jq &>/dev/null || return 0

  local host="${LANGFUSE_HOST:-http://localhost:3002}"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  local payload
  payload=$(jq -n \
    --arg name "$name" \
    --arg run_id "$run_id" \
    --arg agent "$agent" \
    --arg verdict "$verdict" \
    --argjson duration "$duration_ms" \
    --arg ts "$ts" \
    '{
      batch: [{
        id: ("evt-" + ($run_id | tostring) + "-" + ($name | tostring) + "-" + ($ts | tostring)),
        type: "span-create",
        timestamp: $ts,
        body: {
          id: ("span-" + ($run_id | tostring) + "-" + ($name | tostring) + "-" + ($ts | tostring)),
          traceId: ("trace-" + ($run_id | tostring)),
          name: $name,
          startTime: $ts,
          metadata: {
            agent: $agent,
            verdict: $verdict,
            duration_ms: $duration,
            run_id: $run_id
          }
        }
      }]
    }')

  curl -fsS -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
    -X POST "$host/api/public/ingestion" \
    -H 'content-type: application/json' \
    --max-time 2 \
    -d "$payload" >/dev/null 2>&1 || true
  return 0
}

# trace_gate_verdict <run_id> <gate_name> <verdict>
# Convenience wrapper for hook scripts after they write a state.json gate entry.
trace_gate_verdict() {
  trace_span "gate.${2}" "$1" "hook" "$3" 0
}
