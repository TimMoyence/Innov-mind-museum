#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# reconcile-branch-protection.sh
#
# Reconciles the live `required_status_checks` of the protected branch to the
# declarative manifest at .github/branch-protection/main.json.
#
#   * Idempotent  — no-op (exit 0) when live == desired.
#   * Safe-by-default — a `guarded` context (promptfoo*) is pinned ONLY when its
#     workflow uses a JOB-LEVEL gate (`pull_request: {}`). If the workflow still
#     filters at workflow level, the context is DROPPED from required instead of
#     freezing every PR on an 'Expected'-forever check.
#   * Non-destructive on permission failure — a 403 surfaces as a red job; the
#     live protection is left untouched.
#
# Scope: ONLY required_status_checks (strict + contexts). It never touches
# enforce_admins or any other protection setting.
#
# Run context: the working tree MUST be the protected branch (CI: push to main
# checks out main; the freeze-guard greps the workflows in THIS tree). Running
# it from another branch reads that branch's workflows — use DRY_RUN=1 there.
#
# Token: needs administration:write.
#   CI    — GITHUB_TOKEN with `permissions: administration: write`.
#   Local — an admin `gh auth login`.
#
# Env:
#   REPO     default TimMoyence/Innov-mind-museum
#   BRANCH   default main
#   MANIFEST default .github/branch-protection/main.json
#   DRY_RUN  set to 1 to print the intended PATCH without applying it.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="${REPO:-TimMoyence/Innov-mind-museum}"
BRANCH="${BRANCH:-main}"
MANIFEST="${MANIFEST:-.github/branch-protection/main.json}"
DRY_RUN="${DRY_RUN:-0}"

trap 'echo "::error::reconcile-branch-protection failed. If the cause is HTTP 403, the token lacks administration:write — provision a scoped GitHub App (see .github/branch-protection/README.md). Live protection was NOT modified."' ERR

command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not found" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "manifest not found: $MANIFEST" >&2; exit 1; }

# A workflow is "job-level gated" (safe to pin) when its `on.pull_request` is the
# empty mapping `pull_request: {}`. A regression to `pull_request:\n  paths:` does
# NOT match, so the guarded context is dropped rather than frozen.
workflow_is_job_level() {
  local f="$1"
  [ -f "$f" ] && grep -qE '^[[:space:]]*pull_request:[[:space:]]*\{\}[[:space:]]*$' "$f"
}

# Build the desired contexts list: always[] + guarded[] whose guard passes.
CONTEXTS=()
while IFS= read -r ctx; do
  CONTEXTS+=("$ctx")
done < <(jq -r '.required_status_checks.always[]' "$MANIFEST")

while IFS=$'\t' read -r ctx wf; do
  if workflow_is_job_level "$wf"; then
    CONTEXTS+=("$ctx")
  else
    echo "::warning::guarded context '$ctx' NOT pinned — '$wf' is not job-level-gated (pull_request: {}); dropped to avoid a merge freeze."
  fi
done < <(jq -r '.required_status_checks.guarded[] | "\(.context)\t\(.workflow)"' "$MANIFEST")

STRICT="$(jq '.required_status_checks.strict' "$MANIFEST")"

DESIRED="$(printf '%s\n' "${CONTEXTS[@]}" | jq -R . | jq -s --argjson strict "$STRICT" '{strict: $strict, contexts: .}')"
DESIRED_SORTED="$(echo "$DESIRED" | jq -S '{strict, contexts: (.contexts | sort)}')"

LIVE_SORTED="$(gh api "repos/$REPO/branches/$BRANCH/protection/required_status_checks" \
  --jq '{strict: .strict, contexts: (.contexts | sort)}' | jq -S .)"

echo "desired contexts: $(echo "$DESIRED" | jq -c '.contexts')"
echo "live    contexts: $(echo "$LIVE_SORTED" | jq -c '.contexts')"

if [ "$LIVE_SORTED" = "$DESIRED_SORTED" ]; then
  echo "branch protection already in sync — no change."
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 — would PATCH required_status_checks to the desired set above. No change applied."
  exit 0
fi

echo "drift detected — reconciling required_status_checks…"
echo "$DESIRED" | gh api -X PATCH \
  "repos/$REPO/branches/$BRANCH/protection/required_status_checks" \
  --input - >/dev/null
echo "reconciled. New required contexts pinned from manifest."
