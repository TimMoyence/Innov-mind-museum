# ADR-015 — Chat Guardrail v2: LLM Judge Layer + Multilingual Insults

**Status**: Amended 2026-05-14 — master `GUARDRAILS_V2_CANDIDATE` flag retired; both V2 layers now activate independently and run **in parallel** as defense-in-depth (see Amendment below).
**Date**: 2026-04-30 (original), 2026-05-14 (amendment)
**Deciders**: Tech Lead (sec-hardening-2026-04-30 team), user gate
**Numbering note**: Originally ADR-012 in the design spec. Renumbered because ADR-012 was concurrently taken by `ADR-012-test-pyramid-taxonomy.md` from a parallel workstream. Commit message `80e3e1cb` references the design-spec numbering; this file is the authoritative record.

## Amendment 2026-05-14 — `GUARDRAILS_V2_CANDIDATE` retired ; dual-layer defense-in-depth enabled (ROADMAP_TEAM T1.7#2)

### Motivation

The master env flag `GUARDRAILS_V2_CANDIDATE` (`'off' | 'llm-guard' | 'llm-judge'`) is **removed** for two reasons :

1. **Doctrine `feedback_no_feature_flags_prelaunch`** — the flag was a feature-flag in spirit, exactly the pattern forbidden pré-launch.
2. **Mutual exclusivity was an artificial limit, not a design choice.** The original `candidate` enum forced operators to pick *either* the sidecar (`llm-guard`) *or* the structured-output judge (`llm-judge`). In production (`CANDIDATE=llm-guard`), the judge layer **never ran** — operators who believed they had defense-in-depth in fact had only the sidecar. The two layers operate at independent points of the chat pipeline and have no architectural reason to be mutually exclusive.

### New activation model

Each V2 layer activates from its **own required config presence**, and both run **simultaneously** when both are configured :

| Layer | Old activation | New activation |
|---|---|---|
| **LLM Guard sidecar** (ProtectAI, fail-CLOSED HTTP scanner) | `GUARDRAILS_V2_CANDIDATE === 'llm-guard'` AND `GUARDRAILS_V2_LLM_GUARD_URL` set | `GUARDRAILS_V2_LLM_GUARD_URL` set (URL presence is the toggle) |
| **Structured-output judge** (LLM-as-judge with confidence score + JudgeDecision) | `GUARDRAILS_V2_CANDIDATE === 'llm-judge'` (mutually exclusive with sidecar) | `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY > 0` (default `500` cents = $5/day OpenAI cap) |

Both layers run on top of the V1 keyword pre-filter (`art-topic-guardrail.ts`), structural prompt isolation, and input sanitization (`sanitizePromptInput()`). The pipeline order :

1. **V1 keyword guardrail** (synchronous, ~5ms) — fast reject on insult / injection / off-topic
2. **LLM Guard sidecar** (HTTP, fail-CLOSED, 1500ms timeout, circuit breaker ADR-047) — multi-scanner Python sidecar
3. **LLM judge** (OpenAI structured output, 500ms timeout, fails-open) — confidence score + verdict on uncertain V1 allows (msg ≥ 50 chars, budget remaining)

The keyword filter handles 100% of traffic ; the sidecar handles 100% ; the judge handles only V1-allow-but-uncertain on long messages, capped at $5/day.

### Code changes (commit accompanying this amendment)

- `src/config/env-resolvers.ts` : `resolveGuardrailsCandidate` + `guardrailsCandidateSchema` removed
- `src/config/env.types.ts` : `GuardrailsV2Candidate` type removed, `guardrails.candidate` field dropped
- `src/config/env.ts` : `guardrails.candidate` field dropped, `budgetCentsPerDay` default kept at `500` cents
- `src/modules/chat/chat-module.ts` : `buildGuardrailProvider` keyed off `env.guardrails.llmGuardUrl` ; `llmJudgeEnabled` keyed off `budgetCentsPerDay > 0` (no longer mutually exclusive)
- 3 comment sites updated (`chat.service.ts`, `chat-message.service.ts`, `guardrail-evaluation.service.ts`)
- `tests/integration/security/auth-email-service-kind-prod-reject.test.ts` mock env block dropped `candidate: 'off'`
- `museum-backend/.env.example`, `.env.production.example`, `deploy/docker-compose.prod.yml`, `docker-compose.guardrails.yml` : `GUARDRAILS_V2_CANDIDATE=…` line removed (dead config), `LLM_GUARDRAIL_*` judge layer vars added explicit to surface the dual-layer posture

### Production posture (2026-05-14, /srv/museum/.env)

```bash
# Sidecar (always wired pre-launch)
GUARDRAILS_V2_LLM_GUARD_URL=http://llm-guard:8081
GUARDRAILS_V2_TIMEOUT_MS=1500   # bumped from 500 after 2026-05-12 incident
GUARDRAILS_V2_OBSERVE_ONLY=false # enforce mode

# Judge layer (activated 2026-05-14 — was OFF before due to mutual-exclusivity)
LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY=500
LLM_GUARDRAIL_JUDGE_TIMEOUT_MS=500
LLM_GUARDRAIL_JUDGE_MIN_LENGTH=50
GUARDRAIL_BUDGET_BACKEND=redis
```

### Behavioural impact

- Production deploy that already sets `GUARDRAILS_V2_LLM_GUARD_URL` → sidecar layer behaviour unchanged (still wired, fail-CLOSED per ADR-047).
- Production deploy that had `GUARDRAILS_V2_CANDIDATE=llm-guard` → judge layer now activates **in addition** to the sidecar (defense-in-depth). Net new OpenAI cost capped at `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY` ($5/day default).
- Production deploy that wants to disable the judge layer → set `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY=0` explicitly.
- Test mocks that asserted `candidate === 'off'` to skip both layers → must omit the URL **and** set `budgetCentsPerDay: 0` to keep the same posture.

### Reversal path

A new ADR amending or superseding this one. Any reintroduction of a master flag must explicitly justify why doctrine `feedback_no_feature_flags_prelaunch` no longer applies (typically because pre-launch is over).

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

> Consolidated 2026-05-07 from `docs/archive/nl-reports-2026-04-17/reports/P11-decision.md` (sidecar benchmark v1→v2→v3 — archive purged 2026-05-07, recoverable via `git log -- docs/archive/nl-reports-2026-04-17/`).

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

To promote: set `GUARDRAILS_V2_OBSERVE_ONLY=false` + tighten judge confidence floor in `eval/v2-layers.helper.ts:45` from 0.6 → 0.95.

### Phase C — Block full (production-grade)

Promotion criteria (must all hold over 30 consecutive days in Phase B):

- False positive rate observed ≤ 1%.
- Zero documented bypass (injection détectée mais pas bloquée).

To promote: lower confidence floor to 0.6 in `eval/v2-layers.helper.ts:45` (default) and keep observe-only false.

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

## Amendment 2026-05-18 — OUTPUT O3 art-topic classifier retired (C9.9)

The output-side LLM-based art-topic classifier (`ArtTopicClassifier` +
`runArtTopicClassifier`) ran as the third layer of `evaluateOutput()` (after
the V1 keyword guardrail and the V2 `GuardrailProvider` adapter). It made a
second LLM call (`gpt-4o-mini`, 3 tokens out) on every chat output to confirm
the answer was art / museum related, and fail-CLOSED on classifier throw with
a generic `unsafe_output` refusal.

It was retired (UFR-016 "il est mort on l'enterre") because the same protection
is already provided three times over by independent layers:

1. **Section prompt** (`llm-sections.ts`) — the orchestrator injects an
   art / museum-focused section prompt before any user content. Off-topic
   answers virtually never originate from this prompt.
2. **L3 LLM judge on INPUTS** (`llm-judge-guardrail.ts`, C9.7 detached
   2026-05-18) — for uncertain inputs ≥ 50 chars, the judge runs a 4-way
   classification (`allow / block:offtopic / block:injection / block:abuse`)
   BEFORE the LLM is called. Off-topic inputs never reach the LLM, so the
   LLM never produces an off-topic output.
3. **Promptfoo CI gate** (`.github/workflows/llm-security-promptfoo.yml`)
   — 85 adversarial prompts × 8 locales × 10 attack families, gates merges
   at ≥ 95 % pass rate. Any regression in output-topic adherence trips this
   gate.

Files deleted:
- `museum-backend/src/modules/chat/useCase/guardrail/art-topic-classifier.ts`
- `museum-backend/src/modules/chat/useCase/guardrail/eval/output-classifier.helper.ts`
- `museum-backend/tests/unit/chat/art-topic-classifier.test.ts`

Surface retained:
- `aggregateOutputText` moved to new module
  `useCase/guardrail/eval/output-aggregator.ts` (still aggregates LLM-authored
  image captions + rationales into a single string for the V1 keyword
  guardrail to scan — invariant unchanged).
- Audit payload field `classifierRan: boolean` retained for downstream audit
  consumers; value is permanently `false` after this PR.

Expected wins (V1 traffic ≈ 6 k–8 k chats/month):
- Latency: −50 to −500 ms per output (one `gpt-4o-mini` RTT eliminated).
- Cost: ≈ −$1–2 / month (one classifier call per chat output).

Defense surface AFTER burial is therefore: V1 input keyword + L3 input judge
+ section prompt + V1 output keyword + V2 output provider + promptfoo CI.
Six layers, none redundant.

## References

- banking-grade hardening design (deleted 2026-05-03 — see git commit history) (Phase D F4)
- ADR-005 — prompt-injection-v2 (predecessor, keyword-only v1)
- Commit `80e3e1cb` — `feat(chat): F4 LLM-judge guardrail v2 + multilingual insult coverage`
- Test contracts: `museum-backend/tests/unit/chat/{art-topic-guardrail-multilingue,llm-judge-guardrail,guardrail-budget,chat.service.guardrail-v2}.test.ts`
- P11 sidecar benchmark report (consolidated above; original deleted 2026-05-07 with archive purge)
- `docs/explications-sprint-2026-05-05/04-guardrails-juges-promptfoo-latence.md` — operator-facing pedagogical explanation
