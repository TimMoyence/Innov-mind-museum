# ADR-058 — Selective hexagonal ports: keep multi-impl ports, inline single-impl ports

**Status:** Proposed
**Date:** 2026-05-17
**Deciders:** Tech Lead (selective inlining = 1–2 days of focused work, decision pending)
**Closes:** audit-2026-05-12 P1-3, TD-18 (chat ports inline review)
**Source preserved:** Rationale derives from `docs/audit-2026-05-12/MASTER.md` P1-3 + `docs/audit-2026-05-12-raw/` findings (slated for deletion).

---

## Context

Musaium's backend follows a hexagonal (ports & adapters) architecture: each module exposes **ports** (interfaces) consumed by use-cases, with **adapters** (concrete implementations) wired at the composition root.

Audited 2026-05-12 (P1-3) + cross-checked in `docs/audit-2026-05-12-raw/`, the codebase carries:

- **16 BE repository interfaces with single implementation** (e.g. `IMuseumRepository` with only `MuseumRepositoryPg`, where the typeorm + in-memory test split IS used and justifies the port).
- **13 chat ports remaining post-TD-8** in `museum-backend/src/modules/chat/`. TD-8 already inlined 3 ports (image-processor, knowledge-router, llm-judge) — the work was tractable and visibly reduced indirection.

The chat module is the most opinionated illustration: an orchestrator composes a 9-step pipeline, and each step traverses a port → adapter indirection. Many of those ports have **exactly one production adapter**, no test-time swap, no second provider on the horizon. The port exists because "hexagonal style" was applied uniformly at module creation, not because the abstraction is load-bearing.

The audit estimated **~2000 LOC of indirection** across these 13 ports (interface files + adapter wiring + index re-exports + JSDoc). This is the cost of "hexagonal cosplay" — the shape of hexagonal architecture without its substance (no second impl, no test swap, no plug-and-play).

### Already-inlined precedent (TD-8)

Three ports already went through this exercise:

1. **Image processor** — single Sharp-based impl, no test fake; inlined into prepare-message pipeline.
2. **Knowledge router** — single rule-based router; inlined into orchestrator.
3. **LLM judge** — single OpenAI-as-judge impl; inlined into guardrail evaluation service.

Outcome: code shorter, test count unchanged (tests asserted behavior via use-case, not via port mock), no regressions. The TD-8 exercise proved the inlining pattern is safe and net-positive when applied selectively.

---

## Decision

**Codify a port-justification rule. A port is justified iff:**

- **(a) there are ≥2 production implementations** (genuine adapter polymorphism, e.g. multi-provider strategy), **OR**
- **(b) the test-swap value (in-memory vs typeorm split) is concretely used in test suites**.

**Otherwise, inline the adapter at the call site.** Delete the interface, delete the adapter re-export barrel, wire the concrete implementation directly into the use-case or composition root.

### Ports to KEEP (multi-impl or test-swap)

- **`web-search.port`** — **7 production impls** (Brave, Tavily, Bing, DuckDuckGo, Serper, Wikipedia, internal fallback). Genuine strategy pattern; keep the port.
- **`knowledge-base.port`** — **4 production impls** (Wikidata, museum-curated, OpenSearch index, fallback). Keep.
- **`MuseumRepository`** — typeorm impl (prod) + in-memory impl (tests). Test-swap value concretely used in `tests/unit/modules/museum/**.test.ts`. Keep.
- **`UserRepository`, `ChatSessionRepository`, `ChatMessageRepository`** — same typeorm + in-memory test split, concretely used. Keep.

### Single-impl ports candidate for INLINING

13 chat ports remain after TD-8. Each is single-impl, no test swap, no second-impl on the roadmap. Inline targets:

- `audio-storage.port` → S3-based adapter inlined into chat-media use-case
- `audio-transcriber.port` → OpenAI Whisper adapter inlined into voice pipeline
- `chat-orchestrator.port` → LangChain orchestrator inlined into chat-message service
- `embeddings.port` → SigLIP ONNX adapter (note: per CLAUDE.md gotcha re. SigLIP preprocessing `[-1, 1]` normalisation) inlined into artwork-match use-case
- `guardrail-provider.port` → **after ADR-048 stabilises the V1 keyword + V2 LLM Guard + V2 judge stack**, inline whichever orchestration emerges
- `image-source.port` → adapter inlined into image-fetch use-case
- `image-storage.port` → S3 adapter inlined
- `ocr.port` → Tesseract adapter inlined
- `pii-sanitizer.port` → sanitizer adapter inlined (the `sanitizePromptInput` from `chat.service.ts` already lives at the use-case layer; the port wrapper is pure ceremony)
- `tts.port` → OpenAI `gpt-4o-mini-tts` adapter inlined into voice-reply use-case
- `wikidata-kb-dump.port` → dump consumer adapter inlined into knowledge-base seeding job

Each inline is a 1–4 file diff, deletes ~50–200 LOC per port, preserves identical test coverage (tests already exercise use-case behavior, not port shape).

### Inlining methodology

For each candidate port:

1. **Verify single-impl in repo** — `grep -rn "implements <PortName>" src/` must return exactly one class.
2. **Verify no test fake** — `grep -rn "<PortName>" tests/` must NOT show an alternative implementation used in any test.
3. **Verify no roadmap second-impl** — check `docs/ROADMAP_PRODUCT.md` + `docs/ROADMAP_TEAM.md` for any planned second adapter.
4. **Inline:** delete the interface file, move the adapter class to the use-case directory, update imports, drop the composition-root wiring line.
5. **Run `pnpm lint && pnpm test`** to confirm zero regression.
6. **Run `gitnexus_detect_changes()`** to verify the change footprint matches the inlining scope (CLAUDE.md gitnexus discipline).
7. **Commit per port** — atomic, reversible if a future second-impl ever materialises.

Total estimated effort: **1–2 focused days** for the 11 inlinable ports.

---

## Consequences

### Positive

- **~2000 LOC of indirection removed** across chat ports.
- **Onboarding cost drops** — new contributors no longer have to chase a port → adapter → impl chain for 13 single-impl handoffs.
- **No loss of testability** — tests already assert use-case behavior, not port-shape conformance.
- **TD-18 (chat ports inline review) closes.**
- **Future second-impl introduction stays cheap** — re-introducing a port is a 1-file diff if a real second adapter ever appears (the rule (a) trigger).
- **Aligns with feedback `feedback_bury_dead_code` doctrine** — hexagonal cosplay IS dead abstraction; bury it, don't gate it behind DEPRECATED markers.

### Negative / accepted

- The hexagonal architecture chapter of `docs/ARCHITECTURE.md` becomes less symmetric — "13 chat ports" no longer holds; the architecture story becomes "ports where they earn their keep, inline elsewhere."
- A future contributor adding a second adapter to one of the inlined slots must do the **port re-introduction** as a separate atomic refactor — they cannot drop a second adapter into the existing port (the port no longer exists). This is the expected cost of selective inlining.
- Some style purists will object to mixing hexagonal-style modules (chat after inlining) with strict-hexagonal modules (museum, auth, admin). We accept the heterogeneity — it reflects the actual variance in abstraction value across modules.

### Migration safety

- All 11 candidate ports are single-impl with no test swap — the inlining is mechanical refactor, NOT a behavior change.
- Each port inline is one atomic commit, reversible via `git revert`.
- `pnpm lint && pnpm test` gate per commit.
- `gitnexus_detect_changes()` per commit to confirm the change footprint matches the port being inlined.
- No DB migration, no API contract change, no observability change.

### Guardrail port — special handling

`guardrail-provider.port` (or its functional equivalent) sits at the intersection of ADR-048 (guardrail strategy) and this ADR. ADR-048 documents the V1 + V2 + V2 LLM Guard stack, where multiple guardrail layers run in parallel. Until ADR-048's "single source of truth for guardrail composition" stabilises, the guardrail port stays as-is. **Inline only after ADR-048 reaches `Implemented` status** — at that point, the composition is fixed and the port becomes a single-impl wrapper.

---

## Alternatives considered

- **Inline all 16 + 13 ports indiscriminately.** Rejected: multi-impl ports (web-search 7-way, knowledge-base 4-way) need polymorphism. Inlining there would force a giant `switch (provider)` at the use-case layer or per-provider use-case duplication — strictly worse.
- **Keep all ports indefinitely.** Rejected: that's the current state. Audit P1-3 + TD-18 quantified the indirection cost; doing nothing is paying the cost for no gain.
- **Adopt a different architectural style for chat (e.g. functional pipeline).** Rejected: out of scope, V1 launch in 2 weeks, refactoring chat's overall shape is a multi-sprint exercise. Selective inlining is the surgical move.
- **Inline ports behind a feature flag for gradual rollout.** Rejected per `feedback_no_feature_flags_prelaunch`. Inlining is a refactor with zero runtime behavior change; flag is unnecessary ceremony.
- **Promote the rule to a lint check (ESLint rule "no single-impl port").** Considered. Would catch new violations automatically. Deferred to a follow-up — lint rule first requires a clean baseline (i.e. the inlining must run first to establish the baseline).

---

## Rollback

If a port inline causes an unexpected regression:

1. `git revert <inline commit>` — restores the port + adapter + composition-root wiring.
2. No DB / API rollback needed (refactor only).
3. Re-investigate before re-attempting.

Each port inline is one independent commit; rollback granularity = one port at a time.

---

## References

- `docs/audit-2026-05-12/MASTER.md` — P1-3 (selective ports policy)
- `docs/audit-2026-05-12-raw/` — supporting findings (slated for deletion; key numbers preserved here: 16 BE single-impl repo interfaces, 13 chat ports post-TD-8, ~2000 LOC indirection)
- TD-8 — already-inlined precedent (image-processor, knowledge-router, llm-judge)
- TD-18 — chat ports inline review (this ADR closes TD-18)
- ADR-048 — guardrail strategy (gates the guardrail-port inline timing)
- ADR-036 — LLM cache strategy (single-impl `LlmCacheServiceImpl`, mentioned for parallel "single-impl is fine, don't reintroduce indirection" doctrine)
- `docs/ARCHITECTURE.md` — module shapes (will need a section update post-inlining to acknowledge the chat-module heterogeneity)
- `feedback_bury_dead_code` — same-commit deletion of port interfaces during inline
- `feedback_no_feature_flags_prelaunch` — no flag on the refactor
- CLAUDE.md § Pièges connus — SigLIP `[-1, 1]` preprocessing (relevant when inlining `embeddings.port` → SigLIP adapter)

---

**Honesty caveat (UFR-013):** The "~2000 LOC of indirection" figure comes from the audit-2026-05-12-raw aggregate count of port interface files + barrel re-exports + composition-root wiring lines. It is an estimate of removable code, not a measured benchmark. The 11 ports listed as candidates were enumerated from the chat module's port directory at audit time; if a second impl has shipped between audit and ADR adoption, the candidate list must be re-verified per the "Inlining methodology" step 1 before any inline commit.
