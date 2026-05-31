# Mutation-scope evaluation — chat guardrail decision logic

> **Status:** Evaluation + proposal (NOT imposed). 2026-06-01.
> **Trigger:** 360 audit dim.1 (`audit-state/2026-05-31-cartographie-360`) — finding: "le plancher mutation se limite aux 8 hot-files (`.stryker-hot-files.json`) ; la majorité du code n'a aucun seuil mutation."
> **Companion:** the e2e blind-spot closure (`tests/e2e/chat-guardrail-chain.e2e.test.ts`, run `2026-05-31-e2e-guardrail-blindspot`) + the coverage-gate decision (`docs/adr/ADR-007-coverage-gate-policy.md` Amendment 2026-06-01).
> **This document does NOT modify `.stryker-hot-files.json` and does NOT re-arm the Stryker CI job** — see §4.

## 1. Current state (verified)

`.stryker-hot-files.json` pins **8** banking-grade files at `killRatioMin: 80` (each must also appear in the Stryker `mutate:` config). Guardrail-relevant entries today:

| Hot file | What it covers |
|---|---|
| `src/modules/chat/useCase/guardrail/art-topic-guardrail.ts` | V1 keyword guard (insults/off-topic/injection) **and** the keyword output guard (`evaluateAssistantOutputGuardrail`) |
| `src/shared/validation/input.ts` | `sanitizePromptInput` (Unicode normalize + zero-width strip + truncate) |
| `src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts` | LLM provider circuit breaker |

**Not pinned** (no mutation floor today) — the guard *decision/orchestration* layer:

| File | Security-critical logic with NO mutation floor |
|---|---|
| `src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts` | `evaluateInput` (V1 + V2 provider verdict → allow/deny short-circuit), `evaluateOutput` → `buildBlockedOutputPayload` (replaces leaky/blocked model text), `handleInputBlock` (persists refusal). **This is where allow/block is decided.** |
| `src/modules/chat/useCase/message/chat-message.service.ts` | `postMessage` flow — short-circuits before `orchestrator.generate()` when `prep.kind==='refused'` (`:244-245`); runs the output guard after `generate()`. **The guard ordering / short-circuit gate.** |
| `src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts` | LLM plumbing (message assembly, structured-output invoke, circuit/cost breakers). Mostly not guard logic. |

## 2. Why this matters (gap analysis)

The new e2e test proves the guard chain **behaviourally** end-to-end (a prompt-injection is refused without reaching the model; a keyword-blockable model output is replaced; isolation marker precedes user content; a V2-provider deny short-circuits; happy path reaches the model). That closes the *integration* blind spot.

It does **not** give the *unit-level mutation* guarantee that the **decision predicates** are tightly tested. Examples of mutants that the e2e alone may not kill but mutation testing on `guardrail-evaluation.service.ts` would:

- flip `allow: false` → `allow: true` in `evaluateInput`'s block branch,
- negate the `prep.kind === 'refused'` short-circuit condition,
- swap `buildBlockedOutputPayload(...)` for the raw model text on output block,
- weaken a confidence/threshold comparison (`<` → `<=`).

These are exactly the "silent security break" mutations the hot-files policy exists to catch — and today the decision layer is outside it.

## 3. Proposal (phased, NOT imposed)

**Phase 1 (recommended, highest value / smallest surface):** add
`src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts` to `.stryker-hot-files.json`
at `killRatioMin: 80`, rationale "Guardrail allow/block decision + output-block replacement. Mutation here = silent safety bypass." It is the single most security-load-bearing un-pinned file and is mostly pure decision logic (good mutation-testing target).

**Phase 2 (optional, after Phase 1 baseline stabilises):** add
`src/modules/chat/useCase/message/chat-message.service.ts` (the short-circuit ordering gate). Larger surface, more orchestration glue → expect a longer tail of survivors; pin only once its unit suite is mutation-hardened.

**Not recommended for the hot-list:** `langchain.orchestrator.ts` — it is LLM plumbing (circuit/cost breakers already have dedicated hot-files + unit suites), not guard-decision logic. Mutation budget is better spent on the decision layer.

## 4. Hard caveats — why this is a proposal, not a change

1. **The Stryker CI job is currently `if: false`** (disabled 2026-05-09; the 360 audit demoted the brut report's "Stryker = real CI gate" claim as an overclaim — `ci-cd-backend.yml:401-411`). **Adding a hot-file today has zero CI effect** until that job is re-armed. Re-arming it is **explicitly out of scope** for this work (it was a named exclusion of the e2e run).
2. **Hot-file ⇒ mutate-list coupling:** each `.stryker-hot-files.json` entry **must** also be in the relevant `stryker/module-*.config.mjs` `mutate:` list (per the file's own `description`). Adding `guardrail-evaluation.service.ts` requires editing `stryker/module-chat-guardrails.config.mjs` in the same change — otherwise the gate references a file Stryker never mutates.
3. **Open-handles gotcha:** chat-module files run under Stryker with `forceExit:false`, which surfaces BullMQ/ioredis open handles as `Timeout`-labelled kills (CLAUDE.md § Pièges connus). The Phase-1 file's unit suite must pin `EXTRACTION_WORKER_ENABLED=false` + `CACHE_ENABLED=false` (existing `tests/helpers/<scope>/jest-env.setup.ts` pattern) before pinning, or the mutation run will hang/mislabel.
4. **Cost:** mutation runs are expensive; widen the scope only in lockstep with re-arming the CI job and a cost budget (the original Garak removal precedent — estimated-vs-real cost blow-up — argues for measuring first).

## 5. Recommendation

When the Stryker CI job is re-armed (separate decision), **adopt Phase 1** (`guardrail-evaluation.service.ts` → hot-files + `module-chat-guardrails` mutate list, killRatioMin 80) as the first decision-layer extension, with Phase 2 (`chat-message.service.ts`) following once its unit suite is mutation-hardened. Until the job is re-armed, this remains a **documented proposal** — no config is changed here to avoid shipping dead/uncoupled config.
