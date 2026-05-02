# V12 W8 — Cosign + SLSA L3 + audit_log verifier + Renovate pin

**Status:** Renovate pin shipped. Cosign sign + verify reusable workflows shipped. Audit-chain verifier shipped (helper + 4 unit tests). Wire-into-deploy + audit-cron-job = deferred (require BE source touch in active session zone, or are user-side ops).

---

## 1. Audit-log hash chain verifier (shipped)

The audit-log already had a hash chain (`museum-backend/src/shared/audit/audit-chain.ts` — `computeRowHash` + `AUDIT_CHAIN_GENESIS_HASH`). W8 adds the **verifier** that consumes that chain end-to-end.

- `museum-backend/src/shared/audit/audit-chain-verifier.ts` — pure function `verifyAuditChain(rowsInOrder)` returning `{ rowsScanned, intact, break | null }`. No DB dependency; caller fetches rows ordered by `created_at ASC, id ASC`.
- `museum-backend/tests/unit/shared/audit/audit-chain-verifier.test.ts` — 5 cases: empty list, valid 5-row chain, prev_hash mismatch, post-insert mutation, genesis-mismatch on row 0.

### Periodic verification (deferred operational wiring)

Choose one path:

**Option A — BullMQ cron job in BE.** New worker reads pages of audit_log (offset+limit by `created_at`), pipes to `verifyAuditChain`, writes alert + on-call notification on break. Risk: BE source touch; defer to quiet session.

**Option B — Standalone CLI script + GHA cron.** `museum-backend/scripts/verify-audit-chain.cjs` queries staging or prod (read-only role) and asserts `intact === true`. New `.github/workflows/audit-chain-verify-nightly.yml` runs the script with cron `0 4 * * *`. Posts to Slack on break. Lower BE intrusion — recommended next step.

---

## 2. Cosign + SLSA L3 (shipped as reusable workflows)

### 2.1 What shipped

- `.github/workflows/cosign-sign-image.yml` — reusable workflow (`workflow_call`). Signs an image keyless via sigstore + emits SLSA provenance attestation pushed to the registry. Permissions: `id-token: write`, `packages: write`, `attestations: write`.
- `.github/workflows/cosign-verify-deploy.yml` — reusable workflow. Verifies signature + SLSA provenance against a configurable `--certificate-identity-regexp` (defaults to this-repo workflows). Fails the calling workflow if either check fails.

### 2.2 How to wire into ci-cd-backend.yml (DEFERRED — single edit, deferred to user)

Append the sign step after the existing image-push step, then call verify before the deploy step:

```yaml
# ci-cd-backend.yml — example wiring

jobs:
  build:
    # ... existing build + push steps ...
    outputs:
      digest: ${{ steps.push.outputs.digest }}     # docker/build-push-action emits this

  sign:
    needs: build
    if: github.event_name == 'push'
    uses: ./.github/workflows/cosign-sign-image.yml
    with:
      image: ghcr.io/${{ github.repository_owner }}/museum-backend
      digest: ${{ needs.build.outputs.digest }}
    permissions:
      id-token: write
      packages: write
      attestations: write

  verify-prod:
    needs: [build, sign]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    uses: ./.github/workflows/cosign-verify-deploy.yml
    with:
      image: ghcr.io/${{ github.repository_owner }}/museum-backend
      digest: ${{ needs.build.outputs.digest }}

  deploy-prod:
    needs: verify-prod
    # ... existing prod deploy ...
```

The wiring is one ~25-line YAML insertion. Deferred to user because (a) ci-cd-backend.yml is high-impact infra that should be reviewed by you before edit, and (b) any miswire blocks all deploys. The reusable workflows are tested-in-isolation safe to ship now.

### 2.3 Local verification (any user can run)

Once a build runs through the signing job:

```bash
# Install
brew install cosign

# Verify signature
cosign verify ghcr.io/<owner>/museum-backend@sha256:<digest> \
  --certificate-identity-regexp 'https://github.com/<owner>/<repo>/.github/workflows/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# Verify SLSA provenance
cosign verify-attestation --type slsaprovenance ghcr.io/<owner>/museum-backend@sha256:<digest> \
  --certificate-identity-regexp 'https://github.com/<owner>/<repo>/.github/workflows/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

---

## 3. Renovate pin (shipped)

`renovate.json` (repo root) — Renovate config with Musaium-specific rules:

| Rule | Effect |
|---|---|
| `langchain` + `@langchain/*` | `rangeStrategy: pin` + `minimumReleaseAge: 3 days` + `prPriority: 10` (V12 §4 LLM03 supply-chain — 3 CVEs in 2024-2025 minor releases) |
| OpenAI / Google / Deepseek SDKs | `rangeStrategy: pin` + `minimumReleaseAge: 7 days` + manual review label |
| `typeorm` / `pg` / `reflect-metadata` | `rangeStrategy: pin` + `minimumReleaseAge: 7 days` (TypeORM v1 in flight, breaking changes possible) |
| Expo + React Native | grouped, weekly (Monday), `minimumReleaseAge: 7 days` |
| Dev deps low-risk patterns (`@types/`, `eslint*`, `prettier`, `jest*`, `vitest*`, `@stryker-mutator/*`, `playwright*`) | auto-merge patch + minor |
| Major upgrades | NEVER auto-merge, `minimumReleaseAge: 14 days`, manual review label |
| Security alerts | priority — schedule "at any time" (no schedule throttling) |

Plus: `lockFileMaintenance` weekly (Monday), `pnpmDedupe` post-update, ignored paths (`node_modules`, `.stryker-tmp`, `.expo`, `dist`, `infra/langfuse`).

Renovate activation: enable the GitHub App on the repo if not already. No further code change.

---

## 4. Acceptance gate (W8 done)

- [x] Renovate pin config live (`renovate.json`).
- [x] Cosign sign reusable workflow live.
- [x] Cosign verify reusable workflow live.
- [x] SLSA L3 provenance attestation included in sign workflow.
- [x] Audit-chain verifier helper + 4 unit cases shipped.
- [ ] ci-cd-backend.yml wired to call sign + verify (deferred — user-side, ~25 line YAML edit).
- [ ] Audit-chain nightly verification (deferred — Option A worker OR Option B GHA cron).

W8 ships the reusable building blocks; final deploy-pipeline integration is a 25-line YAML stitch the user reviews before merging.

---

## 5. V12 status overview after W8

| Wk | Status | Artefact |
|---|---|---|
| W1 | shipped | `infra/langfuse/` + `docs/plans/V12_W1_LANGFUSE_INTEGRATION.md` |
| W2 | shipped | dispatcher v12 + `team-state/` + Spec Kit + deterministic hooks |
| W3 fin | shipped | `agent-mandate.md` v12 layout |
| W4 | shipped | Architect/Editor split formal in `agent-mandate.md` |
| W5 | partial | promptfoo CI + corpus shipped; indirect-injection wrapper / Prompt-Guard-2 / Presidio output deferred to quiet chat-module session |
| W6 | partial | fast-check property test on sanitizer + openapi-diff CI shipped; Stryker hot-files extension + guardrail/rate-limit property tests deferred |
| W7 | shipped | ast-grep config + 3 starter rules + Spec Kit production pilot guide |
| W8 | partial | Renovate + Cosign sign+verify + audit-chain verifier shipped; ci-cd-backend.yml wiring + nightly chain verify deferred |

V12 architecture **mostly closed**. Remaining ~15% is operational stitching that benefits from user review before infrastructure changes.
