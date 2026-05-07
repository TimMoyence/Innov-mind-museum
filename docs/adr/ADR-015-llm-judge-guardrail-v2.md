# ADR-015 — Chat Guardrail v2: LLM Judge Layer + Multilingual Insults

**Status**: Accepted (rolled out behind `GUARDRAILS_V2_CANDIDATE=llm-judge`)
**Date**: 2026-04-30
**Deciders**: Tech Lead (sec-hardening-2026-04-30 team), user gate
**Numbering note**: Originally ADR-012 in the design spec. Renumbered because ADR-012 was concurrently taken by `ADR-012-test-pyramid-taxonomy.md` from a parallel workstream. Commit message `80e3e1cb` references the design-spec numbering; this file is the authoritative record.

## Context

`src/modules/chat/useCase/art-topic-guardrail.ts` (audit 2026-04-30 finding **F4 (MEDIUM)**) had:

- **INSULT_KEYWORDS**: 16 entries, **FR + EN only**.
- **INJECTION_PATTERNS**: 60+ entries across 8 languages (EN, FR, DE, ES, IT, JA, ZH, AR).

Asymmetric coverage created a false sense of multilingual defence — an attacker using insults in DE, ES, IT, JA, ZH, or AR bypassed the keyword pre-filter. ADR-005 (prompt-injection-v2) acknowledged the keyword approach was a v1 placeholder; the env flag `GUARDRAILS_V2_CANDIDATE` was already wired (`'off' | 'llm-guard' | 'nemo' | 'prompt-armor'`) to track future provider choices.

Audit decision binary (per design spec §2 ADR-012, now this file):
- (a) **Finish multilingue with an LLM judge wired through the existing flag** (defense in depth on top of keyword pre-filter).
- (b) Admit v1 keyword-only and strip the injection list multilingue for symmetry.

## Decision

**Option (a) — LLM judge layer with multilingue insult expansion.** Implementation:

1. **Multilingue insult expansion**: 38 entries across 8 languages, matching the existing INJECTION_PATTERNS coverage. Closes the i18n asymmetry without requiring the second-layer LLM call for the trivial case.

2. **`'llm-judge'` candidate added to `GUARDRAILS_V2_CANDIDATE`** (kept `'off'` default — opt-in until soaked in staging). Judge runs **only** when:
   - Env flag is `'llm-judge'`, AND
   - Keyword pre-filter returned `allow`, AND
   - Message length > 50 chars (env `LLM_GUARDRAIL_JUDGE_MIN_LENGTH`).

3. **Structured-output JSON with Zod validation**: judge response is `{decision: 'allow' | 'block:offtopic' | 'block:injection' | 'block:abuse', confidence: 0..1}`. Free-text or schema-violating responses are rejected.

4. **Latency cap**: `Promise.race(judge, timeout(500ms))` (env `LLM_GUARDRAIL_JUDGE_TIMEOUT_MS`). On timeout → fallback to keyword decision + log `guardrail_judge_timeout`.

5. **Cost cap**: `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY` (default 500 = 5€/day). Per-process counter with lazy UTC reset. Once exhausted → fallback to keyword + log `guardrail_judge_budget_exceeded`. **Multi-instance prod has per-instance budget — cumulative spend can be N× the cap.** Acceptable for v1; Phase 2 = move to Redis SET+TTL.

6. **Rule precedence**:
   - Keyword `block:*` → ALWAYS WINS (judge never invoked).
   - Keyword `allow` + judge `block:*` with `confidence >= 0.6` → judge overrides.
   - Keyword `allow` + judge `block:*` with `confidence < 0.6` → keyword wins (allow).
   - Any judge error / timeout / budget / parse fail → keyword wins.

## Adversarial Review (Challenger)

| Counter-argument | Response |
|---|---|
| **Cost**: every chat message gets a second LLM call → 2× LLM cost. | Selective invocation: only on long messages (>50 chars) AND only when keyword said allow. Estimated <15% of messages. Hard daily cap via env flag; once exceeded, fallback to keyword-only for the rest of the day. |
| **Latency**: judge adds p99 latency. | Hard 500ms timeout via Promise.race. On timeout, keyword decision serves the user. Worst-case latency increase = 500ms on the slowest 1% of messages, with no impact on the response itself (the request continues with keyword decision). |
| **Judge can be jailbroken**: the LLM itself is susceptible to prompt injection. | Structured-output JSON with Zod schema rejects free-text. Judge prompt isolated via `[END OF SYSTEM INSTRUCTIONS]` marker (matches existing pattern in `llm-sections.ts`). Defense-in-depth — judge + keyword combined; even if judge is fooled, keyword still triggers on obvious patterns. |
| **Fail-open on edge cases hides errors.** | Every fail mode logs a distinct event (`guardrail_judge_timeout`, `guardrail_judge_budget_exceeded`, `guardrail_judge_parse_error`, `guardrail_judge_throw`). Sentry alerts on >5% failure rate (alert config follow-up). |

## Rejected Alternative

**Option (b) — strip injection list multilingue for symmetry.** Rejected — would re-expose attack surface that already passes tests today. UFR-001 (no minimal fix as viable option).

## Consequences

**Positive**:
- Multilingual insults caught at the cheap keyword layer (no LLM cost).
- LLM judge catches obfuscated insults / injection in long messages where keyword regex fails.
- Layered defense — even with judge disabled, keyword pre-filter handles 80%+ of cases.
- Cost-bounded — daily cap prevents runaway spend.

**Negative**:
- Per-instance budget counter — multi-instance prod overspends by replica count. Phase 2 fix.
- Judge prompt currently uses the orchestrator's existing system-prompt path; a dedicated strict-isolation channel on `ChatOrchestrator` would harden against future regressions. Phase 2.
- Judge introduces a new dependency on the LLM provider being available; falls back gracefully but adds operational surface (a new failure mode to monitor).

## Phase rollout & promotion criteria

> Consolidated 2026-05-07 from `docs/archive/nl-reports-2026-04-17/reports/P11-decision.md` (sidecar benchmark v1→v2→v3).

The `llm-guard` Python sidecar (P11) and the LLM judge (this ADR) share the same rollout scheme. Three phases, each with measurable promotion criteria.

### Phase A — Observe-only (current default in prod)

**Config**:
```bash
# museum-backend/.env.production
GUARDRAILS_V2_CANDIDATE=llm-guard
GUARDRAILS_V2_OBSERVE_ONLY=true   # log decisions, never block
GUARDRAILS_V2_TIMEOUT_MS=500      # margin over measured P95=375ms
```

In observe-only mode, blocking decisions are downgraded to `allow: true` after logging the would-block decision. Operators can validate the candidate on production traffic without user-visible refusals.

### Phase B — Block on high confidence (≥0.95)

Promotion criteria (must all hold over 30 consecutive days):

- Real prod blocking rate ≤ 7% (benign passage ≥ 93%).
- Sidecar P95 under load ≤ 500 ms.
- Zero over-blocking incidents reported by support.

To promote: set `GUARDRAILS_V2_OBSERVE_ONLY=false` + tighten judge confidence floor in `guardrail-evaluation.service.ts:118` from 0.6 → 0.95.

### Phase C — Block full (production-grade)

Promotion criteria (must all hold over 30 consecutive days in Phase B):

- False positive rate observed ≤ 1%.
- Zero documented bypass (injection détectée mais pas bloquée).

To promote: lower confidence floor to 0.6 in `guardrail-evaluation.service.ts:118` (default) and keep observe-only false.

## Sidecar `ANONYMIZE_ENTITIES` rationale

The Presidio Anonymize scanner default covers 27 PII types. For Musaium, only 11 are kept (see `museum-backend/deploy/docker-compose.prod.yml`):

```
EMAIL_ADDRESS, PHONE_NUMBER, CREDIT_CARD, IBAN_CODE, IP_ADDRESS,
US_SSN, US_PASSPORT, US_DRIVER_LICENSE, CRYPTO, URL, MEDICAL_LICENSE
```

**Excluded entities** (with rationale):

- **PERSON / LOCATION / ORG / NRP**: Presidio `SpacyRecognizer` flags every artist (`Léonardo da Vinci`), every museum (`Louvre`), every painting title (`Arnolfini Portrait`). Benchmark v1 → v3 showed `benign_art` accuracy collapsed from 94% (v3) to 58% (v1) when these entities were enabled. **Catastrophic for an art-museum bot.**
- **DATE_TIME**: museum opening hours, exhibition dates, artist birth/death dates are quoted constantly. False positive rate too high.

Trade-off accepted: lose detection of "my name is John Smith, I live at 12 rue X" type leaks. Mitigation: Musaium does not store visitor identities, and the V1 sanitizer (`sanitizePromptInput`) already normalizes prompt input before persistence.

If user-name detection becomes required: build a denylist of ~500 canonical artists rather than re-enable PERSON.

## What NOT to do in V2 (rejected configurations)

- **`BanTopics` scanner**: tested in v1 with `threshold=0.6`, classified art-classical content as `adult/violence/politics`. Smoke test failure: "phone number 06 12 34 56 78" flagged `adult: 0.66`. The V1 keyword `art-topic-guardrail.ts` (8 languages, 0 ms latency, 0 FP) is superior for off-topic detection. Do not re-enable BanTopics.
- **`PERSON` recognizer in Anonymize**: see above. Use the curated denylist if needed.

## Benchmark scorecard (P11 — 2026-04-18)

| Criterion | Target | v3 measured | Verdict |
|-----------|--------|-------------|---------|
| Sidecar P95 latency added | ≤ 150 ms | 375 ms (2.5×) | ❌ Over but acceptable in Phase A |
| FP rate on benign content | ≤ current +2pp | 5.0% | ⚠️ Tight, acceptable in observe |
| Injection detect rate | ≥ +20pp | +96.7pp (0 → 96.7%) | ✅ Quasi-perfect |
| PII detect rate (strict 11 types) | ≥ 90% | ~100% on email/phone/CC/IBAN | ✅ |
| $/1k msgs | ≤ $0.005 | ~$0 (self-hosted CPU/MPS) | ✅ |

Reproductibilité du benchmark : `museum-backend/ops/llm-guard-sidecar/README.md` + `scripts/benchmark-guardrails.ts`.

## References

- banking-grade hardening design (deleted 2026-05-03 — see git commit history) (Phase D F4)
- ADR-005 — prompt-injection-v2 (predecessor, keyword-only v1)
- Commit `80e3e1cb` — `feat(chat): F4 LLM-judge guardrail v2 + multilingual insult coverage`
- Test contracts: `museum-backend/tests/unit/chat/{art-topic-guardrail-multilingue,llm-judge-guardrail,guardrail-budget,chat.service.guardrail-v2}.test.ts`
- P11 sidecar benchmark report (consolidated above; original deleted 2026-05-07 with archive purge)
- `docs/explications-sprint-2026-05-05/04-guardrails-juges-promptfoo-latence.md` — operator-facing pedagogical explanation
