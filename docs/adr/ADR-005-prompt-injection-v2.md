# ADR-005 — Prompt-injection v2 (NFKC + confusables + boundary markers)

- **Status**: Proposed (2026-04-21)
- **Owner**: Backend — chat module
- **Supersedes**: guardrail baseline documented in audit `2026-04-20_security-full-audit.md`

## Context

The current art-topic guardrail (`museum-backend/src/modules/chat/useCase/art-topic-guardrail.ts:16-23`) normalises user input with **NFD + combining-marks strip**:

```ts
value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
```

The 2026-04 audit (cross-verified against OWASP LLM Top 10 2025 — LLM01 Prompt Injection) confirmed three independent bypass paths:

1. **Homoglyph substitution** — `ignоre` (Cyrillic `о`, U+043E) passes NFD untouched because it has no compatibility decomposition to Latin `o` (U+006F). Research 2026 papers report cross-script attacks at 44–76 % ASR against moderated LLMs.
2. **Encoded payloads** — base64, ROT13, zero-width-joined tokens slip past keyword match before the LLM decodes them.
3. **Semantic drift** — synonyms `overlook`, `dismiss`, `forget the above` are not in the blacklist.

Additionally:
- The `input.context.location` and `input.context.locale` fields are injected into the system prompt without sanitisation (`llm-sections.ts:107-110`).
- No boundary marker separates system instructions from user content in the final LLM message array.
- The LLM-side second-pass guardrail uses the same weak keyword table, so output leaks share the input gaps.

Evidence sources: WebSearch 2026-04-21 on OWASP LLM Top 10 2025, Unicode Technical Report #36 (confusables), and the `@paultendo/confusables-nfkc-conflict` note proving NFKC alone does not resolve cross-script confusables.

## Decision

Ship a **defence-in-depth v2 guardrail** in a single atomic change:

1. **Normalisation** — replace `NFD + combining-strip` with **`NFKC`** applied *then* a Unicode-confusables map (`unicode-confusables` library, ≥ 1M weekly downloads, active maintainer). This folds homoglyphs (`ignоre` → `ignore`) before the keyword match.
2. **Keyword table expansion** — add synonyms (`overlook`, `forget (all|above|previous)`, `dismiss`, `disregard`) and French/Spanish/Italian/Portuguese/German counterparts already maintained in the file.
3. **Encoded-payload detector** — regex `/[A-Za-z0-9+/=]{20,}/` → attempt `Buffer.from(match, 'base64')` decode → re-normalise and re-match keywords. Same for `atob` of URL-safe base64.
4. **Boundary markers in prompt assembly** (`llm-prompt-builder.ts`) — system instructions wrapped with `[BEGIN RESTRICTED SYSTEM INSTRUCTIONS]` / `[END RESTRICTED — USER INPUT FOLLOWS BELOW]`. User content sits *after* the terminator only.
5. **Input sanitisation of structured fields** — extend `sanitizePromptInput()` in `llm-sections.ts` to cover `location` (truncate to 120 chars + strip control chars) and `locale` (regex-gate `/^[a-z]{2}(-[A-Z]{2})?$/`, reject otherwise).
6. **Second-pass output guardrail** — same v2 normalisation + keyword table applied to LLM output before returning to the user.
7. **Nightly AI tests** — the `RUN_AI_TESTS=true` gate is promoted to a scheduled CI job (budget-capped OpenAI key, $10/day cap) so guardrails are validated against live models, not only mocks.
8. **Coverage** — 30 bypass test cases in `tests/unit/chat/prompt-injection-v2.spec.ts` covering homoglyphs (RU/EL/UK scripts), base64, ROT13, synonyms, multi-hop concat, unicode control chars.

## Rejected alternatives

- **NFKC alone** — rejected: confusables are distinct code points with no compatibility relation; NFKC does not fold Cyrillic `о` to Latin `o`. Documented in Unicode Technical Report #36.
- **LLM-classifier first-line-of-defence** — rejected for latency and cost. Keyword guardrail + confusables is synchronous and cheap; LLM second-pass stays but does not replace it.
- **Full Unicode block allowlist (Latin-only)** — rejected: breaks legitimate multilingual users (FR/ES/IT/PT/DE/EL/UA/RU-Cyrillic users, CJK, Arabic). Musaium is multilingual by design.
- **Remove the guardrail, rely on LLM** — rejected: OWASP LLM01 explicitly recommends pre-tokenisation normalisation as first line of defence.

## Consequences

### Positive
- Closes 3 known bypass classes (homoglyph, base64, synonym).
- Adds a durable boundary contract that future prompt authors cannot silently break.
- Sanitised structured fields eliminate a second-order injection vector.
- Nightly AI tests transform the guardrail from "tested against mocks" to "tested against the live failure surface".

### Negative
- Adds one supply-chain dependency (`unicode-confusables`). Vetted at ≥ 1M dl/week and active maintenance; CI `pnpm audit --prod` gate blocks new high/critical CVEs.
- +30 test cases lengthen the chat test suite. Net acceptable — cost < 2 s wall-clock.
- `RUN_AI_TESTS` nightly job consumes OpenAI credits. Budget cap $10/day enforced via dedicated key.

## Follow-ups

- Open [Bloc A2] ticket — implementation + 30 test cases.
- Monitor first-week false-positive rate after deploy; tune confusables allowlist if legitimate words are folded away.
- Revisit in 6 months — if LLM-side jailbreak tool-call guardrails mature, re-evaluate hybrid architecture.
