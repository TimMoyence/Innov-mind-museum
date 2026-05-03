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

## References

- banking-grade hardening design (deleted 2026-05-03 — see git commit history) (Phase D F4)
- ADR-005 — prompt-injection-v2 (predecessor, keyword-only v1)
- Commit `80e3e1cb` — `feat(chat): F4 LLM-judge guardrail v2 + multilingual insult coverage`
- Test contracts: `museum-backend/tests/unit/chat/{art-topic-guardrail-multilingue,llm-judge-guardrail,guardrail-budget,chat.service.guardrail-v2}.test.ts`
