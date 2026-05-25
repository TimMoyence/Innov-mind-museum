# ADR-061 — I-SEC8 reclassification : `artwork_knowledge` is a global catalogue, not a multi-tenant store

**Status:** Accepted
**Date:** 2026-05-22
**Run:** `2026-05-21-p0-gdpr` (P0 GDPR residual lot)
**Supersedes (claim):** the pre-launch audit framing of I-SEC8 as "cross-tenant `museum_id` scoping leak in `ArtworkKnowledge` allowing prompt injection from another museum's knowledge".

---

## Context

The pre-launch GDPR/security audit (May 2026) flagged I-SEC8 as a HIGH-severity multi-tenant scoping defect: the claim was that `artwork_knowledge` rows from one museum could be surfaced into the system prompt of a chat session belonging to another museum, by a client supplying an arbitrary `currentArtworkId`. The remediation proposed was to add `museum_id` to the entity, filter `findById` by `session.museumId`, generate a TypeORM migration, and update every call site.

Read-only verification was carried out on 2026-05-21 against the actual code in `museum-backend/`, captured in `team-state/2026-05-21-p0-gdpr/verification/V1-backend-consent.md` § I-SEC8. The findings reframe the issue:

- `artwork_knowledge` entity (`museum-backend/src/modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity.ts:10-68`) has **no `museum_id` or tenant column**. Its unique index is `[title, artist, locale]` (`:11-13`) — global, not museum-scoped.
- The table is populated by web scraping via `extraction-job.service.ts` (Wikidata + general web), then deduped by `(title, artist, locale)`. It is a **global public-knowledge catalogue**, not a per-museum private knowledge store.
- `findById` (`typeorm-artwork-knowledge.repo.ts:17-19`) takes only a UUID and returns the row — no tenant filter is conceptually possible because the data model has no tenant.
- The `currentArtworkId` is client-supplied and validated only as `optionalNullableUuidV4` shape (`chat-session.schemas.ts:181`); `update-session-context.useCase.ts:38-55` verifies session ownership but does not verify that the artwork belongs to the session's museum (and could not, given the data model).
- The `title` lands in the LLM system prompt at `llm-prompt-builder.ts:74` inside `[CURRENT ARTWORK]`, before `[END OF SYSTEM INSTRUCTIONS]` (`:88`), with `sanitizePromptInput()` applied (`:71`).

The user-decision recorded in `team-state/2026-05-21-p0-gdpr/user-decisions.md` § I-SEC8 explicitly accepts this reframing : "reclassify I-SEC8 LOW, produce an ADR in the documenter phase explaining the reframing, and write zero application code for it."

## Decision

I-SEC8 is **reclassified LOW** and shipped as documentation only in the P0 GDPR run. No application code, no migration, no schema change.

Reasoning:

1. **No tenant boundary exists to leak across.** `artwork_knowledge` is a single global catalogue keyed by `(title, artist, locale)`. There is no "museum A vs museum B" partition that the client could traverse. The original claim ("knowledge of another museum") presupposes a model that the codebase does not implement.
2. **Self-inflicted only.** A user setting `currentArtworkId` to any catalogue row affects exclusively the prompt of their own session. No other user's data is disclosed. The user can already type the artwork title into their own message — the prompt-builder path adds no new exfiltration channel.
3. **Public content.** Catalogue entries originate from web scraping (Wikidata, public sources). Disclosing the title in a prompt is not a confidentiality breach.
4. **Existing mitigation.** `sanitizePromptInput()` (`llm-prompt-builder.ts:71`) normalises Unicode, strips zero-width characters, and truncates the rendered `title` before it lands in the system prompt boundary at `[END OF SYSTEM INSTRUCTIONS]`. This blunts adversarial-title prompt-injection vectors at the structural-isolation layer (CLAUDE.md § AI Safety).

The residual risk is a UX/coherence concern (a client could surface an irrelevant artwork title in their own session prompt, creating a confusing assistant response) — not a security/privacy boundary violation.

## Consequences

### Positive

- Avoids a costly migration (`artwork_knowledge` is the join hub of the knowledge-extraction module; adding `museum_id` would touch the schema, the scrape ingest path, the dedup unique index, and every call site).
- Avoids fabricating a multi-tenant model that does not currently exist and is not required for V1 (single B2C catalogue, no contracted B2B museums — see CLAUDE.md project overview).
- Honest framing : the audit doc was wrong about the threat model; correcting it in an ADR rather than coding around the wrong framing preserves UFR-013 truth-telling.

### Negative / Trade-offs

- If V2 introduces a per-museum private knowledge store (e.g. `museum_knowledge` table for curated, museum-specific cartels not in the public catalogue), tenant scoping becomes a real requirement at that point. This is tracked as `TD-SEC-MULTI-TENANT-01` (placeholder in `docs/TECH_DEBT.md`).
- The `currentArtworkId` value remains client-controllable. A future hardening could validate `artwork_knowledge.id` exists and constrain the rendered title length further, but no concrete attack vector justifies the work in V1.

### Ops checklist

- None. No code change, no env var, no migration.
- The reclassification is reflected in the P0 GDPR run STORY.md and the verification evidence file remains the source of truth for the reframing.

## Alternatives considered

- **(a) Add `museum_id` + scope `findById` anyway, defensively.** Rejected : would force a fabricated tenant boundary onto a global catalogue, introducing schema complexity for no security gain. Either the catalogue is global (V1 stance) or per-museum (V2 design question) — half-measures invite drift.
- **(b) Remove `currentArtworkId` from the session context entirely.** Rejected : the feature is intentional (the "you're looking at X" anchor is a core UX behaviour). Removing it solves a non-problem.
- **(c) Sanitise the title more aggressively (whitelist character set).** Rejected for V1 : `sanitizePromptInput()` + the `[END OF SYSTEM INSTRUCTIONS]` structural boundary are the documented defence-in-depth (CLAUDE.md § AI Safety) and no concrete bypass has been demonstrated against an adversarial `artwork_knowledge` title.

## References

- Verification evidence : `team-state/2026-05-21-p0-gdpr/verification/V1-backend-consent.md` § I-SEC8.
- User decision : `team-state/2026-05-21-p0-gdpr/user-decisions.md` § I-SEC8.
- Spec section : `team-state/2026-05-21-p0-gdpr/spec.md` § 11 (I-SEC8 reclassification).
- Code touchpoints (read-only) : `museum-backend/src/modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity.ts:10-68`, `museum-backend/src/modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo.ts:17-19`, `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:304-318`, `museum-backend/src/modules/chat/useCase/orchestration/llm-prompt-builder.ts:68-88`, `museum-backend/src/modules/chat/adapters/primary/http/schemas/chat-session.schemas.ts:181`, `museum-backend/src/modules/chat/useCase/update-session-context/update-session-context.useCase.ts:38-55`.
- Related : CLAUDE.md § AI Safety (defence-in-depth chat pipeline), ADR-044 (multi-tenant museum onboarding deferred).

---

## Amendment 2026-05-25 — Decision reversed: `museum_id` scope shipped on `artwork_knowledge` (I-SEC8 OPEN → DONE-DEV)

**Status of this ADR:** Accepted → **Superseded in part** (the doc-only stance below is reversed; the threat-model framing in § Context remains accurate).

The original decision (2026-05-22) was *doc-only, no code* — and § Alternatives explicitly **rejected** Alternative (a) "add `museum_id` + scope `findById` anyway, defensively". Run `2026-05-25-isec8-museum-scope` (RUN A of the P0 stability lot, branch `p0/stability`, start commit `02a0e920f`) **reverses that** per user mandate, ship as a faithful mirror of the C7 precedent already shipped on the sibling table `artwork_embeddings` (`AddMuseumIdScopeToArtworkEmbeddings1778622760826`). Note: the C7 embeddings decision was never captured in its own ADR — its rationale lives only in that migration header. This amendment is therefore the first ADR-level record of the "scope both KB tables by internal `museum_id`, NULL = global catalogue" decision for the whole knowledge-base surface.

**Why the reversal stands without contradicting § Context:** the original threat-model analysis is *still correct* — V1 has zero non-NULL `museum_id` rows, `artwork_knowledge` is today a global catalogue, and the live risk is LOW. The decision changes for a *forward-looking infrastructure* reason, not a re-rated threat: the column + read-path scope ship **before** the first B2B onboarding so a tenant going live does not force an emergency refactor on the chat hot path (the `findById` call fires on every turn that resolves `[CURRENT ARTWORK]`). This is the same rationale C7 used for `artwork_embeddings`. The half-measure objection in Alternative (a) is resolved by symmetry: both KB tables now carry the identical scope, so there is no drift between them.

**What shipped (5 source touchpoints + 1 migration, verified against the diff):**
- Migration `museum-backend/src/data/db/migrations/1779697908683-AddMuseumIdScopeToArtworkKnowledge.ts` — adds nullable `museum_id integer`, FK `museums(id) ON DELETE SET NULL`, btree `IDX_artwork_knowledge_museum_id`. Pre-existing unique index `IDX_artwork_knowledge_title_artist_locale` untouched.
- Entity `museum-backend/src/modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity.ts` — `@Column museumId?: number | null` + `@Index('IDX_artwork_knowledge_museum_id')`.
- Port `museum-backend/src/modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port.ts` — `findById(id, museumId?: number | null)`.
- Repo `museum-backend/src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo.ts` — SQL-layer predicate `WHERE id = :id AND (:museumId::integer IS NULL OR ak.museum_id IS NULL OR ak.museum_id = :museumId)`; omitting `museumId` performs a legacy global-only read and emits a grep-able `artwork_knowledge_find_by_id_unscoped` warn.
- Caller `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:359` — cartel lookup now passes `session.museumId` (a pre-existing session field, already used at `:412`/`:499`).

**Scoping semantics (unchanged from C7):** `museum_id IS NULL` = global public catalogue, visible to every tenant; `museum_id = X` = tenant-X-private row, returned only when the session's `museumId === X`; a cross-tenant row resolves to `null`, identical to an unknown id.

**Verdicts:** Review APPROVED (5-axis weighted mean 93.35, C7 fidelity PASS, frozen-test PASS); Security PASS (parameterised predicate, no raw SQL interpolation, no secret/env leak). Tests: `museum-backend/tests/unit/knowledge-extraction/artwork-knowledge-repo.museum-id.test.ts` + `museum-backend/tests/unit/chat/prepare-message-pipeline-artwork-scope.test.ts`.

**Residual (LOW, out-of-scope, deferred hardening):** the *write* path does not validate that a non-NULL `museum_id` on insert/upsert actually belongs to the writing tenant — `currentArtworkId` and write-time `museumId` are not cross-checked against the session's tenant. With zero non-NULL rows in V1 this is inert; it should be revisited as part of the first B2B onboarding (tracked alongside the V2 per-museum private-knowledge work referenced in § Negative / Trade-offs). The original `TD-SEC-MULTI-TENANT-01` placeholder this ADR cited was never actually written into `docs/TECH_DEBT.md` (pre-existing doc-honesty gap, noted here, not addressed by this run).
