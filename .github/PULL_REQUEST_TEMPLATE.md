<!--
Musaium PR template — covers all three apps (backend / mobile / web) + docs.
Sections marked MANDATORY block merge until checked.
-->

## Description

<!-- One paragraph: what changed and why. Frame the "why", not the "what" (the diff already shows the what). -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Breaking change (API contract change, migration required)
- [ ] Documentation only
- [ ] Tooling / CI / build
- [ ] **AI safety / guardrail change** — triggers extra review (see AI safety checklist below)

## AI safety checklist

**MANDATORY if this PR touches `**/guardrails/**`, `**/chat/**`, `**/voice/**`, `**/audit/**`, `**/llm/**`, or any guardrail-related ADR.**

- [ ] No new feature flag `*_ENABLED` introduced (per `feedback_no_feature_flags_prelaunch` — live or revert, no toggles pre-launch V1).
- [ ] Fail-CLOSED contract preserved (no `return { allow: true }` on a failure path — every failure must propagate or block).
- [ ] Audit log emission preserved or extended (every guardrail decision emits an audit row with `metadata.locale`, `metadata.layer`, `metadata.category`, no raw prompt).
- [ ] OWASP LLM Top 10 considered — cite affected risks in the description (LLM01 prompt-injection, LLM02 insecure-output, LLM06 SDoS, etc.).
- [ ] Tests cover the safety contract (regression test for the failure mode being fixed OR for the new path being added).
- [ ] ADR added or amended if doctrine changes (per [`docs/adr/`](../docs/adr/) — guardrail strategy / policy / audit-chain).
- [ ] Red-team corpus check : new patterns added to `tests/red-team/guardrail-corpus.json` if the fix is for a false negative.
- [ ] CODEOWNERS review obtained — the matching path in [`.github/CODEOWNERS`](./CODEOWNERS) must be reviewed before merge.

## Compliance checklist

**MANDATORY if this PR touches user data, voice pipeline, audit logs, or GDPR / AI Act surface.**

- [ ] GDPR PII redaction preserved (no raw prompts in audit metadata — snippet ≤64 chars + sha256 fingerprint only).
- [ ] AI Act Art. 50 disclosure preserved if voice-touching (audio "Vous interagissez avec un assistant IA" + visual badge).
- [ ] GDPR Art. 22 surface preserved if guardrail-decision-touching (explanation endpoint, recourse button) — see [`docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`](../docs/compliance/AI_ACT_CONFORMITY_MATRIX.md).
- [ ] Locale metadata added if guardrail-touching (per [`docs/compliance/FAIRNESS_METRICS_PLAN.md`](../docs/compliance/FAIRNESS_METRICS_PLAN.md)) — required for bias monitoring.
- [ ] DPIA / ROPA impact considered if introducing new data class — flag in description.

## Test plan

- [ ] `pnpm lint` clean (backend / web) — `npm run lint` (mobile).
- [ ] `pnpm test` passes (backend / web) — `npm test` (mobile).
- [ ] Manual smoke if applicable — describe steps below.
- [ ] If migration : `pnpm migration:run` clean + `node scripts/migration-cli.cjs generate --name=Check` returns empty (no schema drift).
- [ ] If OpenAPI change : `pnpm openapi:validate` (backend) + `npm run check:openapi-types` (mobile).

Manual smoke steps (paste exact commands and expected output) :

```
<paste here, or "N/A — covered by automated tests above">
```

## Honesty checklist (UFR-013)

- [ ] I ran every command in the test plan above. I did NOT claim tests pass without running them.
- [ ] If any check failed, the failure is documented above OR fixed.
- [ ] All numbers / paths / claims in this PR description are verified (no fabricated test outputs, no fabricated file paths).

## Risk / rollback

<!--
- What's the blast radius if this lands broken?
- Rollback path: revert this PR? toggle env var? require migration rollback?
- For guardrail / safety PRs: how do we know the safety contract was not weakened?
-->

## Linked

<!-- Closes #N, related to #M, ADR-XYZ, runbook scenario S? -->
