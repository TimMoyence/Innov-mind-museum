# B5 — Lot P0 GDPR/consent #294 — Correctness / data-model / GDPR completeness

Reviewer: senior read-only fresh-context (UFR-022). Branch `dev` @ HEAD `89852f2a1`. Commit under review: `71f103b35` (465 files).
Angle: CORRECTNESS / data-model / GDPR completeness. Final-state reads, not just diff.

## Verdict: 8.5/10 — APPROVED (with 2 real enforcement gaps to track)

The structural pieces are correct, defensible, and well-documented. DSAR export and erasure are
materially complete for the personal-data tables that matter. Two genuine consent-enforcement
gaps (TTS, profile scope) are real but low-to-medium severity and arguably out of strict V1 scope.
All file:line claims below were verified by reading the final state of the cited files + running
the drift sentinel.

---

## ✅ Bien fait

- **DSAR export — table coverage is genuinely complete (Art.15/20).** `exportUserData.useCase.ts:69-139`
  pulls 11 categories in parallel; the 6 new B3 ports (UserMemory, AuditLog, message_feedback,
  message_reports, social_accounts, api_keys) are all wired in `auth/useCase/index.ts:264-339`.
  Cross-checked the full `User` entity (`user.entity.ts:14-170`): every personal/preference column
  is exported except credentials/transients (correct to omit) and 4 operational columns (see ⚠️).
- **Allow-list-by-construction (no entity spread).** Every mapper (`mapAuditLog:163`,
  `mapApiKey:205`, `mapMessageReport:185`) names fields explicitly and the source `*Source`
  interfaces in `exportUserData.types.ts:87-130` declare only the exported subset. Secrets
  (`password`, `*_token`, `hash`/`salt`, `prevHash`/`rowHash`, moderator notes) cannot leak even
  if a future column is added — verified by the test guard `SECRET_KEY_RE` (`exportUserData-completeness.test.ts:35`).
- **Erasure (Art.17) cascade is actually complete — verified at the DB-FK level.** `deleteUser`
  (`user.repository.pg.ts:220-237`) is transactional: deletes `chat_sessions` (→ messages,
  artwork_matches, message_reports, message_feedback via `messageFeedback.entity.ts:22` message-cascade)
  then the `users` row. I verified the FK `ON DELETE CASCADE` exists at SQL level for the tables the
  entity decorators DON'T express: `reviews` (`CreateReviewsTable:22 FK_reviews_userId … ON DELETE CASCADE`),
  `support_tickets` + `ticket_messages` (`CreateSupportTables:24,51,52`), `user_consents`
  (`AddUserConsentTable:29`), plus `user_memories` (`userMemory.entity.ts:24 OneToOne onDelete CASCADE`)
  and `api_keys` (`apiKey.entity.ts:34`). So reviews/support/memory/consents/keys ARE erased even
  though the deleteAccount docstring only enumerates a subset.
- **Erasure ordering is correct (R16).** External cleanup runs BEFORE the DB wipe so refs/email
  stay resolvable: images (`deleteAccount.useCase.ts:81`), TTS audio (`:95`), Brevo contact (`:108`),
  then DB cascade (`:122`). Each external step is best-effort try/catch (R17) — a Brevo/S3 failure
  does not abort erasure.
- **S3 prefix-scan is robust.** `image-storage.s3.ts:116-164` scans the whole `chat-images/` prefix
  (production keys embed `user-<id>` mid-path, so a head-prefix scan would match 0 objects — correctly
  reasoned at `:106-114`), filters with a boundary-safe `/user-<id>/` segment (`:124` — `user-42` won't
  match `user-420`), paginates via continuation token (`:134-146`), and adds DB-sourced legacy refs
  deduped against the native scan (`:148-163`). Batches at the 1000-key S3 limit.
- **Consent checker wired to chat text+image dispatch, fail-CLOSED.** `runConsentGate`
  (`prepare-message.pipeline.ts:268`) runs FIRST in `prepare()` — before `ensureSessionAccess`,
  before persist, before enrichment/BullMQ (R9 + Art.5(1)(c)). Anon = refused without a repo call
  (`third-party-ai-consent-checker.ts:42-44`). AND-intersection on text+image (`consent-gate.ts:71-80`).
- **Audio (STT) gate present + audio→LLM transitively gated.** Route gates
  `third_party_ai_audio_openai` BEFORE Whisper (`chat-media.route.ts:66-71`, default checker injected
  `:224`). The transcribed text then flows `postAudioMessage`→`postMessage`→`pipeline.prepare`
  (`chat-message.service.ts:406`) → re-hits `runConsentGate` on the `text` scope. So the audio LLM
  call IS gated by text consent. Good defense-in-depth.
- **canonical.json = real single source of truth, no residual drift.** Ran
  `node scripts/sentinels/privacy-content-drift.mjs` → **EXIT 0**, "canonical ↔ HTML ↔ web ↔ FE all
  aligned." Sentinel checks version, lastUpdated, all 14 section IDs, all 19 recipient names
  (comment-stripped to defeat docblock aliasing, `:169-217`), the "15 ans" R13 regression guard
  (`:225-232`), plus 2 JSON-copy pairs for the web standalone Docker build (`:76-89`). Confirmed
  19 subprocessors in BOTH fr+en locales, version 1.0.0 / 2026-05-21.
- **DOB hard-throw correct (CNIL 2021-018, age 15).** `register.useCase.ts:104-123` defence-in-depth:
  falsy DOB → `badRequest('dateOfBirth is required')` (:108), NaN guard (:112), `< 15` → 422
  `MINOR_PARENTAL_CONSENT_REQUIRED`. Never parses `undefined` into `new Date`.
- **Brevo unsubscribe idempotent + leak-safe.** `brevo-beta-signup.notifier.ts:82-110`: 404 →
  `not_found` (idempotent success, no throw), api-key NEVER appended to error, body sliced. Noop
  variant for missing creds (`:127-132`).
- **FE consent namespacing closes cross-user inheritance (Art.7).** `consentStorageService.ts:29-38`
  keys on `musaium.consent.aiAccepted.${userId}` derived from the access token; anon→`__anon` safe
  re-prompt; legacy global key NEVER consulted (`:16-20`). `location_to_llm` correctly in FE scopes
  (`consentScopes.ts:38`) rendered in its own group.

---

## ⚠️ À améliorer

1. **[MEDIUM] TTS endpoint is NOT consent-gated.** `chat-media.route.ts:271-279` (`POST
   /messages/:messageId/tts` → `createTtsHandler:202`) sends the assistant message text to OpenAI TTS
   (`chat-media.service.ts:253` `this.tts.synthesize`) with no `isGranted` check. The `audio` scope is
   documented as STT-only (`provider-resolver.ts:36-37,43` "audio = STT"). TTS is a third-party-AI data
   transfer (text → OpenAI) with no gate. Either reuse `third_party_ai_audio_openai` here or document
   a decision that TTS of model-generated text is out of consent scope. Currently undocumented and
   untested (no TTS-consent test exists).

2. **[LOW-MEDIUM] `third_party_ai_profile_*` scope collected but never enforced.** The scope exists in
   the vocabulary (`userConsent.entity.ts:32,36`), is collected by the FE
   (`consentScopes.ts:33,37`), and gets its own hash-chained audit row — but NO gate checks it before
   `userMemoryBlock` (the subject's stored profile/interests/summary) is injected into the LLM prompt
   (`prepare-message.pipeline.ts:420,458`; `consent-gate.ts:62-68` only builds text+image scopes).
   A user who denies profile sharing still has their profile sent to the provider. Partial mitigation:
   UserMemory has its own `disabledByUser` opt-out (`userMemory` export entry `disabledByUser`), but
   that is a separate control from the granular consent the FE advertises. This is a consent/enforcement
   mismatch — the UI promises a granular grant the backend doesn't honor at dispatch.

3. **[LOW] deleteAccount docstring under-enumerates the cascade.** `deleteAccount.useCase.ts:38-40,119-121`
   lists the cascade as messages/artwork_matches/reports/feedback + refresh_tokens/social_accounts/
   api_keys/consents, but OMITS `reviews`, `support_tickets`+`ticket_messages`, and `user_memories`
   — all of which ARE erased via DB FK cascade (verified above) and ARE in the DSAR export. The code is
   correct; the doc is incomplete and could mislead a future maintainer into thinking those tables leak.

4. **[LOW] 4 personal-ish User columns absent from DSAR export.** `deletedAt`, `sessionsMonthCount`,
   `sessionsMonthStart`, `pending_email` (`user.entity.ts:106,139,155,162`) are not exported
   (`exportUserData.useCase.ts:105-127`). Quota counters + soft-delete timestamps are borderline
   "operational, not subject-facing personal data," so omission is defensible under Art.15, but
   `pending_email` (a user-supplied address mid-change) is arguably attributable personal data and a
   stricter reading would include it. Track as a documented exclusion rather than a silent gap.

5. **[INFO] User entity soft-delete comment is stale vs actual hard-delete.** `user.entity.ts:135-137`
   says "RGPD Art. 17 hard erase deferred V1.1" but `deleteUser` (`user.repository.pg.ts:220`) now does
   a transactional HARD delete. The comment predates this lot; harmless but misleading.

---

## 🔧 Reste à faire

- Decide + document TTS consent posture (gate on `audio` scope OR explicit "generated-text TTS exempt"
  ADR). Add a regression test either way.
- Either enforce `third_party_ai_profile_*` before `userMemoryBlock` injection, or drop the profile
  scope from the FE grid + audit vocabulary if it's deliberately not enforced (avoid advertising a
  control that does nothing — Art.7 transparency).
- Update `deleteAccount.useCase.ts` docstring to enumerate reviews / support_tickets / ticket_messages
  / user_memories in the cascade list (1-line doc fix, no behavior change).
- Optionally add `pending_email` to the DSAR export (or note it as an explicit exclusion).
- Fix the stale soft-delete comment in `user.entity.ts:135-137`.

## Verification notes (UFR-013)

- Drift sentinel: RAN `node scripts/sentinels/privacy-content-drift.mjs` → exit 0 (verified, not assumed).
- Subprocessor count: RAN node read of canonical → 19 fr + 19 en (verified).
- FK cascades for reviews/support/consents: READ migration SQL `ON DELETE CASCADE` clauses (verified at
  SQL level, not inferred from entity decorators which omit the relation).
- Audio→text gate transitivity: READ `chat-message.service.ts:406` delegation chain (verified).
- TTS un-gated + profile un-gated: READ route + consent-gate source; grep for any TTS/profile consent
  test returned empty (verified absence).
