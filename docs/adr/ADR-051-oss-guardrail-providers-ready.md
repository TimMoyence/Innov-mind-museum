# ADR-051: OSS GuardrailProvider adapters ready (Presidio + Llama Prompt Guard 2) — not activated

> **Status:** Accepted · **Amended 2026-05-25** (Llama Prompt Guard adapter DELETED — see "Amendment" below; Presidio stays infra-ready)
> **Date:** 2026-05-12
> **Decider:** Tim (founder/tech lead)
> **Builds on:** ADR-015 (LLM-Judge Guardrail V2), ADR-047 (LLM-Guard circuit breaker + fail-CLOSED), ADR-048 (`GuardrailProvider` strategy port)
> **Related:** `team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-guardrail-alternatives.md`, `team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-owasp-llm-top10.md`

---

## Context

ADR-048 established `GuardrailProvider` as the perennial strategy port — designed precisely so swapping the active guardrail implementation is a constructor-injection swap, not a refactor. The perennial-10y-design research run (2026-05-12) surfaced two findings that make the abstract optionality concrete:

1. **Recall gap on prompt injection.** The arXiv 2502.15427 adversarial benchmark places the current `LLM-Guard` PromptInjection scanner (`laiyer-ai/prompt-injection` model lineage, proxied by "ProtectAI v2") at recall **0.22** vs Granite Guardian 3.0 at **0.916**, Llama Guard 2 at **0.733**, and Meta's Llama Prompt Guard 2 86M at **0.975** (vendor-measured, AUC 0.998 multilingual). The current incumbent's recall is the weakest among CPU-viable self-hosted options.
2. **Coverage gap on PII (OWASP LLM02).** The backend's `RegexPiiSanitizer` covers email + phone only. The LLM-Guard `Anonymize` scanner was restricted in our deployment to financial PII (`docker-compose.guardrails.yml` config — PERSON/LOCATION removed after the v3 benchmark flagged artist names as PII). Microsoft Presidio (Apache 2.0, MS-maintained, French spaCy NER shipped) covers PERSON, LOCATION, CREDIT_CARD, IBAN, IP_ADDRESS, US_SSN, US_PASSPORT, CRYPTO, NRP — closing the LLM02 gap. Self-hosted Presidio runs CPU-only at 20-100 ms typical.

The cost-of-switch from LLM-Guard was estimated at ~350-430 LOC and 1-2 dev days given the ADR-048 abstraction. Ship the adapters now so the cost is **paid pre-launch** and the Phase 1 swap is operational, not architectural.

The blocker on activating either adapter today is the **pre-launch V1 doctrine** (`feedback_no_feature_flags_prelaunch.md`, `project_no_staging_v1.md`): prod = stage, no new sidecar to operate before the V1 chat is live and stable. Promoting an adapter without ≥7 days of shadow-mode bake against real prod traffic would violate ADR-036's data-driven-tuning policy.

## Decision

Ship two new `GuardrailProvider` adapters behind the ADR-048 port, both **infra-ready but NOT wired** into the chat-module composition root:

1. **`MicrosoftPresidioAdapter`** — PII NER detection via the Presidio analyzer + anonymizer service pair. Decision ladder: high-confidence entity (`score >= blockThreshold`, default 0.85) → block reason `pii`; lower-confidence entity → allow with `redactedText` from `/anonymize`; no entity → allow. Fail-CLOSED on any error.
2. **`LlamaPromptGuardAdapter`** — prompt-injection + jailbreak detection via Meta's `meta-llama/Llama-Prompt-Guard-2-86M` model behind a custom FastAPI sidecar (mirrors the existing `ops/llm-guard-sidecar/` pattern). Binary classifier mapping `MALICIOUS` + score ≥ threshold (default 0.8) → block reason `prompt_injection` (or `jailbreak` if the sidecar emits split scores). Fail-CLOSED on any error.

Both adapters satisfy the full ADR-048 surface: `name`, `version`, `checkInput`, `checkOutput`, `health`, `metrics`. Both honour the ADR-047 fail-CLOSED contract — any network error, non-OK HTTP, malformed JSON, or timeout returns `{ allow: false, reason: 'service_unavailable', providedBy }`; **never** `allow: true` on error.

Composition root (`chat-module.ts`) is unchanged. `env.guardrails.candidate` keeps its current candidate set (`'off' | 'llm-guard' | 'llm-judge'`). New env knobs (`PRESIDIO_BASE_URL`, `PRESIDIO_TIMEOUT_MS`, `LLAMA_PROMPT_GUARD_BASE_URL`, `LLAMA_PROMPT_GUARD_TIMEOUT_MS`, `LLAMA_PROMPT_GUARD_SCORE_THRESHOLD`) exist on the `env.guardrails.presidio` / `env.guardrails.llamaPromptGuard` config branches but are not consumed by the runtime today.

Docker-compose overlays exist at `docker-compose.presidio.yml` (official MS images, ready to `docker compose up`) and `docker-compose.llama-prompt-guard.yml` (sidecar Dockerfile left to Phase 1).

## Rationale

- **Optionality paid pre-launch.** ADR-048's abstraction yields no value until a second adapter exists. Shipping two **before** launch means the Phase 1 shadow swap is a 30-line composition-root change, not a research/design/build cycle conducted under live-prod pressure.
- **Honest signal, no behaviour change.** Zero traffic flows through these adapters today. Risk of regression to V1 chat = 0. The TypeScript surface ships with full test coverage so the swap, when it happens, lands on a green baseline.
- **OWASP LLM02 + LLM01 coverage is staged**, not promised. The adapters document the upgrade path; the activation decision is data-driven against shadow-mode metrics, not optimism.
- **License hygiene.** Presidio is MIT; the Llama Prompt Guard 2 86M fine-tune carries the Llama 4 Community License (free to 700M MAU, attribution "Built with Llama" required). Both are compatible with Musaium's B2C/B2B distribution at V1 scale.

## Consequences

- Two TypeScript adapters land in the repo (~330 LOC combined, excluding tests).
- Two test suites land (`tests/unit/chat/presidio.adapter.test.ts`, `tests/unit/chat/llama-prompt-guard.adapter.test.ts`) covering happy-path + fail-CLOSED + health + metrics.
- Five new env knobs become parseable on `AppEnv['guardrails']`; none are set in any `.env` file or CI secrets. CI smoke + e2e are unaffected.
- Two `docker-compose.*.yml` overlays exist for local Phase 1 experimentation. Neither is referenced from `docker-compose.dev.yml` and neither runs in CI.
- The chat hot path is unchanged. `env.guardrails.candidate` defaults remain `'off'`/`'llm-guard'` per existing wiring.

## Alternatives rejected

- **(a) Swap LLM-Guard now (pre-launch).** Rejected — violates V1 doctrine (no new sidecar to operate before chat is live and stable), and ADR-036 data-driven-tuning (no production telemetry yet to compare decisions against). Risk of false-positive surge during launch traffic = unacceptable.
- **(b) Skip adapters, build them at Phase 1.** Rejected — surrenders the momentum from the perennial-10y-design research run, forces a re-read of OSS landscape under post-launch pressure, and creates a worse calendar trade-off (1-2 days now vs 3-5 days then under launch stress). The whole point of ADR-048 was to make this cheap; not paying it pre-launch wastes that investment.
- **(c) Wire one of them today behind a feature flag.** Rejected twice — feature flags pre-launch are banned (`feedback_no_feature_flags_prelaunch.md`), AND wiring without shadow telemetry contradicts ADR-036.

## Phase 1 promotion criteria

Before either adapter is activated in `chat-module.ts`, **all** of the following MUST be true (mirrors the shadow-mode gates documented in the compliance-research-guardrail-alternatives.md report):

1. **Bake duration:** ≥ 7 days of shadow traffic on the prod chat endpoint (Musaium ADR-036 bake doctrine).
2. **False-positive rate** on legitimate user messages: < 2 % (measured by human review sample of 200 flagged messages/day).
3. **Recall on synthetic attack corpus:** > 85 % (daily 100-prompt corpus — 50 direct injection, 25 jailbreak, 25 PII extraction).
4. **P95 classification latency:** < 350 ms CPU; **P99:** < 500 ms.
5. **Sidecar error rate (5xx):** < 0.1 % over a rolling 6 h window.
6. **Multi-language recall (FR + EN):** > 80 % per language on a 50-prompt-per-language weekly probe.
7. **PII entity F1 (Presidio only):** > 0.80 on a 100-entity French reference set.
8. **Decision-match vs LLM-Guard incumbent:** tracked, not gated — its purpose is surfacing edge cases for manual audit.

Failure of any criterion blocks promotion; the adapter stays infra-ready, the chat path keeps the LLM-Guard incumbent. A follow-up ADR will codify the actual promotion decision when telemetry passes.

## Rollout notes

- **No rollback needed today** — nothing is wired. The "rollback path" if the adapters cause a TypeScript or test regression at land time is `git revert` of the commit; chat behaviour is preserved.
- **CI impact:** new test suites run as part of `pnpm test`. No new external dependencies (the adapters use the built-in `fetch`).
- **`.env` template impact:** none — the new knobs are optional and have safe numeric defaults.
- **Mobile impact:** none — the chat HTTP contract is unchanged.

## Amendment — Llama Prompt Guard adapter DELETED (executed 2026-05-25)

The `LlamaPromptGuardAdapter` half of this ADR was **executed as a deletion**, not a Phase 1 promotion. Re-cadrage NorthStar + V1-lockdown doctrine retired the "ship-now, wire-later" bet for this specific adapter: a never-wired sidecar adapter sitting dormant in the tree until a post-launch Phase 1 contradicted UFR-016 (bury dead code) more than it served ADR-048 optionality. Decision locked by Tim 2026-05-21 (roadmap item **W6.1 / P0.D3**, `docs/V1_LOCKDOWN_LOTS.md §D3`); **DELETE for V1, wire deferred to V2/V1.1** conditioned on a drop in promptfoo LLM07 pass-rate. Prompt-injection coverage at V1 stays on the active LLM-Guard incumbent (`llm-guard.adapter.ts:85`) + the promptfoo LLM07 adversarial corpus (≥ 95 % gate) + the V1 keyword guardrail.

Removed this run (P0 cleanup lot `2026-05-25-p0-cleanup`, commit D3 `refactor(chat): bury never-wired llama-prompt-guard adapter`):
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/llama-prompt-guard.adapter.ts` (180 LOC)
- `museum-backend/tests/unit/chat/llama-prompt-guard.adapter.test.ts` (338 LOC)
- `museum-backend/docker-compose.llama-prompt-guard.yml` (53 LOC)
- the `guardrails.llamaPromptGuard` config branch in `museum-backend/src/config/env.ts` (`LLAMA_PROMPT_GUARD_BASE_URL` / `_TIMEOUT_MS` / `_SCORE_THRESHOLD`) and its type + JSDoc in `museum-backend/src/config/env.types.ts`. The JSDoc example in `guardrail-provider.port.ts` was reconciled in the same commit.

**Unchanged — the other two providers stay active/ready as decided above:**
- **LLM-Guard** (`llm-guard.adapter.ts`) — the wired V2 incumbent (ADR-047), untouched.
- **`MicrosoftPresidioAdapter`** (`presidio.adapter.ts` + `presidio.adapter.test.ts` + `docker-compose.presidio.yml` + the `guardrails.presidio` env branch) — remains infra-ready-but-not-wired exactly as this ADR's Decision specifies; the Phase 1 promotion criteria above still govern its activation.

This amendment narrows the ADR to a single shipped-but-unwired adapter (Presidio); it does **not** rewrite the original 2026-05-12 decision record above.
