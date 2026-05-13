# ADR-050 — Accept langfuse v3 EOL until 2026-09-01

- **Status**: Accepted
- **Date**: 2026-05-13
- **Owner**: backend / observability
- **Sunset date**: 2026-09-01 (3 months post-launch V1 2026-06-01)
- **Trigger to revisit**: first CVE published against `langfuse@^3.x` OR sunset date reached
- **Linked audit**: Musaium overnight audit 2026-05-12, finding P1-7

## Context

Backend pins `langfuse@^3.38.20` (`museum-backend/package.json` L144), the legacy unscoped TypeScript SDK. The audit 2026-05-12 flagged this line as deprecated upstream — Langfuse has moved active development to a v5 line shipped under scoped packages (`@langfuse/tracing`, `@langfuse/otel`, `@langfuse/client`), built on OpenTelemetry. Verified via `pnpm view`:

- `langfuse` — `latest = 3.38.20`, published one month ago, no `deprecated` field on npm (verified `pnpm view langfuse@latest deprecated` → empty).
- `@langfuse/tracing` — `latest = 5.3.0`, described as "Langfuse instrumentation methods based on OpenTelemetry".
- v5 release notes (github.com/langfuse/langfuse-js/releases v5.0.0) confirm "breaking changes and migration guide" from v4 → v5; v4 itself was the rewrite away from the v3 imperative API.

The v3 line is therefore feature-frozen — no future security patches expected — but is **not formally deprecated on npm today**.

### Current usage surface (verified)

13 files reference langfuse symbols across `museum-backend/`:

Production (9 files):
- `src/shared/observability/langfuse.client.ts` — singleton wrapper, lazy `require('langfuse')`, `Langfuse` constructor (`publicKey`/`secretKey`/`baseUrl`/`flushAt`/`flushInterval`), `shutdownAsync()`.
- `src/shared/observability/chat-phase-timer.ts` — `lf?.trace({ name, metadata })`, `trace.update({ output, metadata })` for STT/LLM/TTS phase spans.
- `src/modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing.ts` — `lf?.trace`, `trace.update`.
- `src/modules/chat/useCase/image/image-enrichment.service.ts` — `lf?.trace`.
- `src/modules/chat/useCase/knowledge/knowledge-base.service.ts` — `lf?.trace`, `trace.update`.
- `src/modules/chat/useCase/knowledge/knowledge-router.service.ts` — `lf?.trace`.
- `src/modules/chat/useCase/orchestration/url-head-probe.ts` — `lf?.trace`.
- `src/modules/chat/useCase/visual-similarity/similarity.service.ts` — `parent?.span({ name, startTime, endTime, metadata })`, `parent?.update`.
- `src/index.ts` — `shutdownLangfuse()` graceful-drain wiring.

Tests (4 files): unit + integration tests that `jest.mock('@shared/observability/langfuse.client')` and assert the v3 trace/span/update shape — `tests/unit/observability/chat-phase-timer.test.ts`, `tests/unit/chat/visual-similarity/similarity.service.test.ts`, `tests/integration/chat/knowledge-spans.test.ts`, `tests/integration/chat/head-probe-spans.test.ts`.

### Critical scope check

Verified the audit's cost-tracking concern is **N/A** for Musaium. Grep for `.generation(`, `promptTokens`, `completionTokens`, `usage:` against the observability + LLM adapter trees returns empty — Musaium uses langfuse for **tracing only**, not cost/usage capture. LLM cost-tracking, if needed later, is a separate ADR.

## Decision

**Accept v3 EOL until 2026-09-01.** Pin `langfuse@~3.38.20` (tilde, no auto-bump beyond patch) and re-evaluate at sunset or on first CVE, whichever comes first.

Rationale — migration to `@langfuse/tracing` v5 is **not a version bump but an architectural rewrite**:

1. **Different paradigm.** v3 = imperative handle-based API (`lf.trace(...) → handle.update(...)`). v5 = OpenTelemetry context-based API (`startActiveObservation(name, async (obs) => { ... })`). Every call site (~7 production sites) needs control-flow restructuring, not just import path change.
2. **Boot wiring changes.** v3 = lazy singleton via `require('langfuse')` on first call. v5 = OTEL provider registration with `LangfuseSpanProcessor` from `@langfuse/otel` at process boot, integrated with the existing `src/shared/observability/opentelemetry.ts` setup. Risk of provider conflicts with the current `@opentelemetry/sdk-node` configuration (notably the `instrumentation-router` exclusion captured in `reference_otel_router_max_listeners.md`).
3. **New dependencies.** At minimum `@langfuse/tracing` + `@langfuse/otel`; possibly `@langfuse/client` for non-tracing surfaces.
4. **Test surface rewrite.** All 4 test files mock `getLangfuse()` and assert the v3 trace/span/update shape. The OTEL mock surface is fundamentally different (spans live in async context, not handle return values).
5. **Touched-file count = 13** (exceeds the audit's ≤10-file decision threshold for "preferred migrate").
6. **Time-boxed estimate >> 1 hour** for safe completion (rewrite + verify tsc + targeted tests + smoke against a live Langfuse endpoint to confirm spans still land + adjust the `chat_phase_complete` log contract if span semantics change).

Doing this work 3 weeks before V1 launch (2026-06-01) creates avoidable risk on a path (chat tracing) that is already fail-open and operationally non-critical — Langfuse outage today does not affect users; an observability rewrite that silently drops spans for two weeks would.

## Consequences

### Accepted risks

- **No upstream security patches on the v3 line.** Mitigations:
  - Tilde-pin (`langfuse: ~3.38.20`) — accept patch bumps only, no minor surprises.
  - Renovate / Dependabot already subscribed at repo level — any v3.x security advisory triggers a PR.
  - GitHub Security Advisory subscription for the `langfuse-js` repository is sufficient because v3 is a thin wrapper around `langfuse-core` (single dep). A CVE in `langfuse-core` propagates as a renovate PR on `langfuse` automatically.
- **Feature drift.** New Langfuse server features (e.g. session linking improvements, prompt management) added since v3.38.20 will not be available in BE traces. Acceptable — Musaium uses tracing for latency/error correlation only, not session reconstruction.
- **Sunset = 2026-09-01.** Three months of revenue / B2B feedback post-launch. By then either (a) a real Langfuse v3 CVE forces the migration, in which case it ships with funded engineering attention, or (b) the migration is replanned with a Spec Kit (`spec.md` + `design.md` + `tasks.md`) and a fresh ADR amendment / supersession.

### Operational hooks

- Add `langfuse@^3` to the weekly dependency review checklist (informally tracked in `docs/TECH_DEBT.md`).
- If a CVE lands before 2026-09-01, re-open this ADR; the existing v3 → v5 migration plan in the "Alternatives considered" section becomes the executable spec.

## Alternatives considered

### A1 — Migrate to `@langfuse/tracing` v5 now (rejected)

- **Why considered**: removes future-security-patch risk; aligns with upstream long-term direction; reuses existing OTEL infrastructure.
- **Why rejected**: 13 files touched, architectural rewrite (imperative-handle → OTEL-context), boot-wiring integration with existing `@opentelemetry/sdk-node` setup, all test mocks rewritten. Estimated effort exceeds the audit's 1-hour gate by a large factor. Doing this 3 weeks pre-launch trades a hypothetical future CVE for a concrete launch-window regression risk on a fail-open observability path. Defer until either (a) a CVE forces the hand, (b) post-launch capacity allows funded planning, or (c) sunset 2026-09-01 hits — whichever is first.

### A2 — Swap provider (rejected)

- **Why considered**: Could replace Langfuse with vanilla OTEL + a different LLM-observability backend (Helicone, Phoenix, LangSmith) or just store spans in our existing Grafana/Tempo stack.
- **Why rejected**: same migration cost as A1 (all 7 call sites rewritten) plus a new vendor decision, contract, and ops surface. Even higher cost-of-change. Cost-tracking concern raised by the audit is N/A (Musaium does not use Langfuse for cost capture — verified by grep).

### A3 — Remove Langfuse entirely, use only Grafana/Tempo (rejected)

- **Why considered**: simplest dependency reduction; we already operate Grafana + Prometheus.
- **Why rejected**: would lose the LLM-specific span schema that the V12 W1 telemetry work standardised on (`chat.compare.*`, `audio.stt.transcribe`, `llm.orchestrate`, `audio.tts.synthesize`). Re-wiring those into Tempo with equivalent UX is itself a project.

## References

- `museum-backend/package.json` L144 — current pin (`langfuse: ^3.38.20`).
- `museum-backend/src/shared/observability/langfuse.client.ts` — singleton wrapper, lazy require, `shutdownAsync()` shutdown contract.
- `museum-backend/src/shared/observability/chat-phase-timer.ts` — phase span emission (STT/LLM/TTS).
- v5 announcement / packages: `@langfuse/tracing@5.3.0`, `@langfuse/otel`, `@langfuse/client` (npm metadata captured 2026-05-13).
- Musaium audit 2026-05-12 finding P1-7 (langfuse v3 EOL).
- CLAUDE.md "Pièges connus" — OTEL `instrumentation-router` interaction (relevant if A1 ever executes).
