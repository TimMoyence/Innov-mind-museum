# ADR-056 — Chat pipeline phase: client-side simulated, not BE-streamed

**Status:** Accepted — implemented
**Date:** 2026-05-17
**Deciders:** Chat UX refonte worktree, /team A5 spec author
**Implemented in:** commits `989395ca1` + `ef9b66178` (dual-emit fix for phase span on success AND failure)
**Source preserved:** This ADR is the canonical home for the A5 architectural rationale; `docs/chat-ux-refonte/specs/A5.md` is slated for deletion.

---

## Context

After ADR-001 retired SSE streaming for the chat pipeline (2026-05-03, route stream commented at `chat-message.route.ts:206-215`, `chat-message.sse-dormant.ts` left as documented dormant code), the chat became **synchronous end-to-end**: POST `/sessions/:id/messages` → wait → `res.status(201).json(result)`.

That left a UX gap. The user types, hits send, and stares at a 3-dot `<TypingIndicator>` for 2.5–6 s while the orchestrator runs a 9-step pipeline:

1. validation + session check (~10 ms)
2. image processing if image (50–200 ms) — `prepare-message.pipeline.ts:212`
3. input guardrail (10–50 ms)
4. user message persistence (20–30 ms)
5. enrichment fan-out KB + web + image (100–800 ms)
6. location resolution Nominatim (100–500 ms)
7. **LLM call dominant (2000–6000 ms)** — `orchestrator.generate`
8. output guardrail (10–100 ms)
9. cache store + persistence (20–40 ms)

The A5 feature wanted to surface this pipeline as **5 contextual status strings** in the user's locale ("Looking at the artwork…", "Searching the collection…", "Composing the answer…", "Preparing the voice…"). The architectural question: **how does the FE know which phase to display?**

The existing observability primitive `ChatPhase = 'stt' | 'llm' | 'tts'` (`museum-backend/src/shared/observability/chat-phase-timer.ts:37`) covers only 3 dimensions for Prometheus + Langfuse — it's a metrics dimension, not a product UX type. And surfacing real phase progress live would require **either**:

- (a) reactivating SSE for status events (reversing ADR-001 + the explicit user decision on 2026-05-14 "stay sync, accelerate elsewhere"), OR
- (b) introducing a WebSocket channel (new protocol, new tests, new ops dependency, violates `feedback_no_feature_flags_prelaunch`).

---

## Decision

**A pure-FE state machine drives the displayed phase, fed by locally observable signals (`isSending`, `hasImage`, `ttsPending`). The BE exposes only the terminal phase (`metadata.phase`) for audit / Langfuse cross-reference, never as a live signal.**

This extends ADR-001's "sync over stream" doctrine into the UX layer: where ADR-001 said "no SSE for chat data flow", ADR-056 says "no live channel for phase either — simulate honestly on the client."

### Architecture

**Backend:**

- New type `ChatPipelinePhase = 'analyzing-image' | 'searching-collection' | 'composing' | 'synthesizing-voice' | 'done'` in `museum-backend/src/modules/chat/domain/chat.types.ts`.
- `ChatAssistantMetadata.phase?: ChatPipelinePhase` — optional (legacy persisted messages have no value).
- `ChatMessageService.postMessage()` sets `metadata.phase = 'done'` on the success path.
- Langfuse spans named `chat.phase.analyzing-image`, `chat.phase.searching-collection`, `chat.phase.composing`, `chat.phase.synthesizing-voice` wrap the corresponding pipeline windows. The dual-emit fix (commit `ef9b66178`) ensures spans emit on BOTH success AND failure paths via `try/finally` + outcome attr — without it, observability was blind to ~5 % of pipeline runs (the failure tail).
- The Prometheus dimension `ChatPhase` stays narrow (`stt | llm | tts`); `ChatPipelinePhase` is a sibling type used only for the API contract + Langfuse span names. This avoids 5/3 cardinality multiplication on existing Grafana dashboards.

**Frontend:**

- `museum-frontend/features/chat/application/phases.ts` — same `ChatPipelinePhase` union (drift catcher test asserts BE/FE lists match).
- `museum-frontend/features/chat/application/useStatusPhase.ts` — pure-reducer hook:
  - On `isSending=true`: phase = `hasImage ? 'analyzing-image' : 'searching-collection'`.
  - Every `PHASE_TICK_MS = 1200`: advance along `PHASE_SEQUENCE_TEXT` / `PHASE_SEQUENCE_IMAGE`, stay on `'composing'` once reached.
  - On `RESPONSE_READY`: phase = `ttsPending ? 'synthesizing-voice' : null`.
  - On `RESET`: phase = `null`.
- `museum-frontend/features/chat/ui/StatusIndicator.tsx` — renders the localised string, `accessibilityLiveRegion="polite"`, `accessibilityRole="text"`, `accessibilityLabel = t(PHASE_I18N_KEY[phase])`. Replaces `TypingIndicator.tsx`.

### Decision matrix

| Criterion | Live BE→FE (SSE/WS) | Client simulated (chosen) |
|---|---|---|
| ADR-001 coherence | Reverses ADR-001 + user decision 2026-05-14 | Extends ADR-001 to UX layer |
| Doctrine `feedback_no_feature_flags_prelaunch` | Requires flag to toggle stream on/off during ramp-up | No flag needed |
| Perceived latency improvement | -40 % (Groovy Web, directional, non peer-reviewed) | Same improvement — the eye sees CHANGING strings, not a static dot. Honest heuristic, not fake progress |
| Engineering cost | +1 channel, +1 protocol, +tests, +ops | ~150 LOC FE pure-reducer |
| Drift risk vs reality | None (BE is truth) | Limited — if simulated phase diverges long, that IS the truth: the LLM is slow and `composing` stays displayed |
| A11y | Identical (live region) | Identical |
| Tests | Integration tests need stream mocks | Pure-reducer Node test runner |

### Trade-off explicitly documented

The displayed phase is a **heuristic, not an instant truth**. This is documented inline in `useStatusPhase.ts` JSDoc per UFR-013 honesty doctrine:

> "The displayed phase is a cosmetic wait signal — each phase *can* correspond to real BE work, but the FE has no ground-truth feed. The terminal phase exposed in `metadata.phase` (audit purposes) is the only authoritative value."

Musaium accepts cosmetic phase divergence rather than reactivating a real-time channel for what is fundamentally a perception affordance.

---

## Consequences

### Positive

- ADR-001 decision preserved — no SSE reactivation, no WS introduction.
- Zero new infrastructure. No new dependency, no `package.json` delta.
- `metadata.phase = 'done'` remains useful for Langfuse cross-check + future audit log enrichment.
- Langfuse spans give post-hoc per-phase timing observability without coupling to the API contract.
- `<StatusIndicator>` replaces `<TypingIndicator>` cleanly (deletion in same commit per `feedback_bury_dead_code`).
- A11y baseline kept: `accessibilityLiveRegion="polite"` announces phase changes to VoiceOver / TalkBack without interrupting other speech (WCAG 4.1.3).
- Reduced motion respected (no fade animation on phase swap).

### Negative / accepted

- Phase shown to the user may lag or lead actual pipeline progress by 1–2 ticks (1.2–2.4 s).
- If the LLM call is anomalously fast (< 1.2 s), the user sees only `'searching-collection'` flash by — acceptable.
- If the LLM call is anomalously slow (> 30 s), the user sees `'composing'` for an extended time — accurate, since composition IS what's blocking.
- Backend cannot easily tell the FE "we're retrying after a transient guardrail block" — the FE shows `'composing'` throughout.

### Honesty caveats (UFR-013)

The "-40 % perceived latency" claim from Groovy Web is **directional only, not peer-reviewed**. We adopt the pattern because it's industry-common (Slack, Claude.ai, ChatGPT all show evolving status strings), not because we have a Musaium-specific A/B result. Post-launch instrumentation will measure actual user-perceived latency via Sentry transaction marks vs. perceived task duration.

---

## Alternatives considered

- **Reactivate SSE for phase events only (no message content).** Rejected: reopens the SSE infrastructure ADR-001 retired; the cost of one-direction telemetry isn't justified by a UX affordance.
- **WebSocket channel for status.** Rejected: new protocol surface, new test infrastructure, conflicts with `feedback_no_feature_flags_prelaunch` (requires flag during rollout).
- **Static "Composing your answer…" single string for the entire wait.** Rejected: the wait is long enough (2.5–6 s P50) that a single string feels like a hang. Five contextual strings give the user a sense of progress without lying.
- **No status indicator at all (keep `<TypingIndicator>` 3 dots).** Rejected: 3 dots for 6 s feels broken; contextual strings test better in dogfood.
- **Reuse the 3 `ChatPhase` Prometheus values (`stt | llm | tts`).** Rejected: too coarse for the UX (a 6 s LLM call would show "llm" the entire time) and would mix telemetry concerns with API contract (Prom cardinality × 5/3).

---

## Rollback

Per UFR-015, hard-flipped without flag. If a critical regression:

1. Revert commits `989395ca1` + `ef9b66178`.
2. `<StatusIndicator>` deletion reverted, `<TypingIndicator>` restored from git.
3. `metadata.phase` field becomes inert in payloads (no consumer relies on it for rendering — only audit / Langfuse).
4. No DB migration to revert.

---

## References

- `docs/chat-ux-refonte/specs/A5.md` — full discovery spec (slated for deletion; rationale preserved here)
- `museum-backend/src/modules/chat/domain/chat.types.ts` — `ChatPipelinePhase` type + `ChatAssistantMetadata.phase`
- `museum-backend/src/shared/observability/chat-phase-timer.ts` — sibling `ChatPhase` for Prometheus
- `museum-frontend/features/chat/application/phases.ts` — FE drift-caught type
- `museum-frontend/features/chat/application/useStatusPhase.ts` — pure-reducer hook
- `museum-frontend/features/chat/ui/StatusIndicator.tsx` — renderer with live region a11y
- ADR-001 — SSE streaming deprecated (this ADR extends the doctrine to UX)
- `feedback_phase_span_dual_path_emit` — Langfuse span MUST emit on success AND failure via `try/finally` + outcome attr (case study: bug found 2026-05-15 in PR #284 review, fixed in commit `ef9b66178`)
- `feedback_no_feature_flags_prelaunch` — no `STATUS_PHASE_ENABLED` flag
- `feedback_bury_dead_code` — `TypingIndicator.tsx` + test deleted same commit
- WCAG 4.1.3 — Status Messages (live region announces phase changes)
- WCAG 2.3.3 — Animation from Interactions (no fade on phase swap when reduced motion)
