# ADR-060 — GDPR Art.17 erasure + Art.15 DSAR compliance chain (museum-backend)

**Status:** Accepted
**Date:** 2026-05-21
**Run:** 2026-05-21-gdpr-erasure-chain
**Closes:** P0 compliance gaps identified in pre-launch audit (6 gaps — TTS audio, Brevo contact, image scan, orphan purge, DSAR completeness, honest docstring)

---

## Context

The V1 launch (2026-06-01, B2C freemium with demo museum data — no B2B pilots contracted) requires demonstrable GDPR Art.17 (right-to-erasure) and Art.15/20 (right-of-access / portability) compliance for end-user personal data. A code audit (2026-05-21) found six load-bearing gaps:

1. TTS audio files stored in S3 (`chat-audios/YYYY/MM/<uuid>`) were never deleted on account erasure — `DeleteAccountUseCase` had no audio cleanup path.
2. Brevo marketing contacts survived account deletion — `BrevoBetaSignupNotifier` only had `subscribe()`, no removal path.
3. Image erasure matched zero production objects — the native scan prefix (`chat-images/user-<id>/`) never matches the production key layout (`chat-images/YYYY/MM/user-<id>/...`). The DB-sourced legacy fallback was additionally silently dropped by a single-arg proxy signature.
4. `runS3OrphanPurge` was fully implemented but had zero callers — orphaned chat media was never reclaimed.
5. `ExportUserDataUseCase` omitted multiple categories of persisted personal data from the Art.15 export (UserMemory, AuditLog actor rows, message_feedback, message_reports, social_accounts, api_keys, plus missing User/ChatSession columns).
6. The `DeleteAccountUseCase` docstring overstated completeness ("full RGPD deletion") in a way that conflicted with UFR-013 (honesty).

---

## Decisions

### D1 — Audio erasure: DB-ref lookup + `deleteByRef` per ref (no `deleteByPrefix`)

Audio objects are stored at `chat-audios/YYYY/MM/<uuid>` — no user or session segment in the key. A `deleteByPrefix('chat-audios/user-<id>/')` would be a no-op and would mislead operators into believing erasure had occurred (UFR-013 violation). Instead:

- A new chat-repository read method `findAudioRefsByUserId(userId)` resolves the user's `audioUrl` refs from `chat_messages` rows in sessions owned by the user (deduped, non-null).
- `DeleteAccountUseCase` receives an `AudioCleanupPort.deleteUserAudio(userId)` (lazy-bound proxy in `auth/useCase/index.ts`) that loops `AudioStorage.deleteByRef(ref)` per resolved ref.
- Per-ref failure is logged and swallowed (best-effort); the DB erasure is never aborted (R3/R17).

No `deleteByPrefix` is added to the audio port — a no-op interface is worse than no interface.

### D2 — Brevo contact removal: `DELETE /v3/contacts/{email}?identifierType=email_id`

The Brevo API's delete-by-identifier endpoint is used with `identifierType=email_id` (verified by user 2026-05-21). The `email` value is URL-encoded (`encodeURIComponent`) to avoid path injection. 404 / "contact does not exist" is treated as idempotent success (R5 — user may never have subscribed). The Brevo api-key is never logged or appended to thrown errors (existing discipline in `brevo-beta-signup.notifier.ts`).

`DeleteAccountUseCase` depends on a narrow `MarketingContactRemovalPort` (in `shared/ports/audio-cleanup.port.ts`) rather than the full leads `BetaSignupNotifier` port, to respect interface-segregation and keep the auth whitelist clean.

### D3 — Image scan fix: scan `chat-images/` + `/user-<id>/` substring filter (boundary-safe)

`S3CompatibleImageStorage.deleteByPrefix` now lists under `Prefix = chat-images/` (the full chat-media namespace) and deletes only keys whose path contains the segment `/user-<id>/` (with leading and trailing slash — `user-42` must not match `user-420`). This correctly matches the production key layout (`chat-images/YYYY/MM/user-<id>/...`). The DB-sourced `legacyFetcher` block is preserved for belt-and-suspenders dedup.

The auth composition root (`auth/useCase/index.ts`) now forwards the `legacyFetcher` as the second argument to `imageCleanupProxy.deleteByPrefix(userId, legacyFetcher)` and wires `legacyImageRefLookup` as the third constructor dependency of `DeleteAccountUseCase` (backed by `getChatRepository().findLegacyImageRefsByUserId`).

### D4 — Orphan-purge cron: new env var `S3_ORPHAN_PURGE_RETENTION_DAYS`, cron at `30 4 * * *`

A new `s3-orphan-purge-cron.registrar.ts` wires `runS3OrphanPurge` into a BullMQ cron (fail-open, graceful shutdown, mandatory `worker.on('error')` per lib-docs/bullmq TD-BMQ-01). The cron runs at `30 4 * * *` (offset from the chat-purge cron at `0 4 * * *`) to avoid same-tick S3 ListObjects contention.

`S3_ORPHAN_PURGE_RETENTION_DAYS` (default `180`) controls the retention window independently of `CHAT_PURGE_RETENTION_DAYS` (design decision D5 from the run — separate tunables so the two windows can diverge at scale without a code change).

### D5 — Audit-log rows are retained on account erasure, but must be included in the Art.15 export

Audit-log rows are an INSERT-only immutable hash chain. Rows where `actor_id = userId` represent the user's own actions. These rows:

- Are **NOT erased** by account deletion (legal-obligation and legitimate-interest retention — the hash chain's integrity depends on all rows remaining; erasing a row would break the chain and undermine the audit trail).
- **ARE included** in the Art.15 DSAR export via the new `AuditLogExportPort` (`listForActor(userId)`). Exported fields: action, actorType, targetType, targetId, metadata, ip, requestId, createdAt. Fields `prevHash` and `rowHash` are excluded (chain internals — disclosing them would aid forgery attempts).

The `DeleteAccountUseCase` docstring (A8b) explicitly states this: "audit_logs rows where actor_id = userId are retained for legal obligation and are not erased."

This stance is consistent with GDPR Recital 65 (retention permitted for legal claims) and does not conflict with Art.17 (which provides exceptions for legal obligation — GDPR Art.17(3)(b)).

### D6 — DSAR export payload versioned at schemaVersion '2'

`UserExportPayload.schemaVersion` is bumped from `'1'` to `'2'`. All new fields are additive. The export uses explicit per-field allow-list mappers (not entity spread) so that a future column addition to any entity cannot accidentally leak into the export payload (D4 from the run design). Secrets and security credentials are excluded by the mappers: no `password`, `*_token`, `hash`, `salt`, `prevHash`, `rowHash` fields are present at any level of the payload (verified by frozen test `export-user-data-completeness.test.ts`).

`message_reports` export includes `status` but excludes `reviewedBy` + `reviewerNotes` — those are moderator staff data, not the data subject's personal data (GDPR Art.15 covers the subject's data, not third-party staff notes about the subject).

---

## Consequences

### Positive

- GDPR Art.17 erasure is now complete: DB rows (cascade), S3 images (prefix scan + legacy fetcher), S3 TTS audio (DB-ref + per-ref delete), Brevo marketing contact (DELETE by email_id).
- GDPR Art.15 export is now complete across all persisted personal-data categories held for a user.
- Orphaned S3 chat media is reclaimed daily (off-peak cron, bounded memory, fail-open).
- The `DeleteAccountUseCase` docstring is now factually accurate (UFR-013 compliant).
- All cross-module access stays via lazy-bound ports in `shared/` + composition-root proxies — no new auth→chat/leads static-type imports.

### Negative / Trade-offs

- `src/index.ts` now exceeds the `max-lines` ESLint threshold — a scoped `max-lines:'off'` override was added. `max-lines-per-function` still applies.
- `listForActor` has no `LIMIT` on the audit-log read. Acceptable under the 1/7-day DSAR rate limit at V1 volume (Q6 from spec); a future `actor_id` index + LIMIT may be warranted at high MAU (noted in interface docstring as ops debt).
- `notableArtworks` in `UserMemoryExportEntry` is `unknown[]` — the JSONB column's structure is opaque. If the jsonb gains PII-bearing fields, a narrower shape should be applied. Ops-noted in code-review.json NIT.

### Ops checklist

- Set `S3_ORPHAN_PURGE_RETENTION_DAYS` in VPS `.env` if the default 180 days needs to differ from `CHAT_PURGE_RETENTION_DAYS` (both default to 180; can diverge).
- Verify the Brevo `BREVO_API_KEY` is set in prod; otherwise `removeContact` silently no-ops (acceptable for pre-beta users with no Brevo contact, but should be confirmed in the ops rotation table).
- The DSAR export `schemaVersion '2'` response body is additive; no consumer breakage expected (FE treats the export as an opaque JSON download, not a typed schema).
