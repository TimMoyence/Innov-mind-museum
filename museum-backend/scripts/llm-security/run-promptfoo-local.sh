#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run-promptfoo-local.sh
#
# Runs the OWASP LLM07 system-prompt-leak corpus against a locally-running
# Musaium backend. Mirrors the CI workflow `.github/workflows/llm-security-
# promptfoo.yml` minus the service-container plumbing.
#
# Usage
#   1. Boot the backend (Postgres + Redis + `pnpm dev` on :3000).
#   2. Register a visitor + create a chat session; export the JWT + sessionId.
#   3. Run:
#        MUSAIUM_API_BASE_URL=http://localhost:3000 \
#        MUSAIUM_API_KEY=<jwt> \
#        MUSAIUM_SESSION_ID=<uuid> \
#        ./run-promptfoo-local.sh
#
# Output
#   ./reports/promptfoo-systemprompt-leak.json
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

: "${MUSAIUM_API_BASE_URL:?must be set (e.g. http://localhost:3000)}"
: "${MUSAIUM_API_KEY:?must be set — visitor JWT from /api/auth/login}"
: "${MUSAIUM_SESSION_ID:?must be set — chat session UUID from POST /api/chat/sessions}"

export PROMPTFOO_DISABLE_TELEMETRY=1

echo "→ Regenerating tests YAML from JSON corpus"
node expand-leak-corpus.mjs

echo "→ Validating promptfoo config"
npx --yes promptfoo@latest validate -c promptfoo-systemprompt-leak.yaml

echo "→ Running promptfoo eval"
mkdir -p reports
npx --yes promptfoo@latest eval \
  --config promptfoo-systemprompt-leak.yaml \
  --max-concurrency 4 \
  --output reports/promptfoo-systemprompt-leak.json

echo
echo "Report: $(pwd)/reports/promptfoo-systemprompt-leak.json"
echo "View results: cd $(pwd) && npx promptfoo view"
