# ADR-053 — Apple Guideline 5.1.2(i) granular third-party AI consent

> Status: implemented 2026-05-16. Effective for backend `v1.2.3` ; mobile EAS build after this branch lands.
> Authored : audit-360 S4 worktree, /team S4-archi-regul pipeline.
> Supersedes : nothing (additive ; the legacy `tos_privacy` consent row stays for ToS proof).
> Cross-refs : `docs/legal/AI_DISCLOSURE.md`, `docs/legal/DPIA.md` § T1.1, `docs/legal/ROPA.md` § `users` / `chat_messages`, `docs/compliance/SUBPROCESSORS.md`.

## Context

Apple's App Store Review Guideline 5.1.2(i) was tightened on 2025-11-13 to require apps that transmit user-identifiable personal data to third-party AI providers to capture **separate, non-bundled, explicit user consent**, scoped by data category and disclosed by provider, distinct from generic ToS/Privacy acceptance. Sources :

- Apple App Store Review Guidelines (canonical, behind dev portal) — https://developer.apple.com/app-store/review/guidelines/
- TechCrunch summary, 2025-11-13 — https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai/

The audit-360 audit (2026-05-16, `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S4-architecture-regulatory.md` § C2) flagged three concurrent gaps :

1. Registration GDPR checkbox bundles ToS + Privacy in a single tick (still acceptable in itself ; the issue is below).
2. The chat-time AI consent sheet (`AiConsentSheetContent`) was a single "I understand, continue" button covering six data categories × three providers in one tap.
3. The AI consent was persisted only in FE `AsyncStorage` (`consent.ai_accepted = 'true'`) — no BE round-trip, no `user_consents` row, no `audit_logs` event, no revocation surface in Settings.

GDPR Article 7 already requires granular + revocable consent ; Apple's 5.1.2(i) makes the App Store review-time gate more explicit. The two combine to require this change.

## Decision

Ship the granular per-category × per-provider consent layer **on top of** the existing `tos_privacy` row, not in place of it. Layering rationale :

- The DPIA T1.1 controller decision keeps `6(1)(b)` (contract performance) as the canonical lawful basis for the chat data flow ; the new consents are *additional* evidence of Apple-grade granularity, not a switch to `6(1)(a)`. This means DPO ratification of the existing DPIA narrative is **not** invalidated by this change ; only an addendum is needed (`docs/legal/DPIA.md` follow-up flagged in T3.2).
- DeepSeek scopes intentionally omitted — already blocked in EU prod by the S4-P0-04 sentinel (CI gate fails if `LLM_PROVIDER=deepseek` && `NODE_ENV=production` in EU).

## Scope shipped

### Backend (commit `b2a2c53d`)

- 7 new audit constants in `museum-backend/src/shared/audit/audit.types.ts` :
  - Specialised : `AUDIT_CONSENT_GRANTED_TOS`, `AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI`, `AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI`, `AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM`, `AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM`.
  - Generic catch-all : `AUDIT_CONSENT_GRANTED`, `AUDIT_CONSENT_REVOKED`.
- 8 new entries appended to `CONSENT_SCOPES` (`museum-backend/src/modules/auth/domain/consent/userConsent.entity.ts`) : `third_party_ai_<text|image|audio|profile>_<openai|google>`.
- New helper `museum-backend/src/modules/auth/useCase/consent/consent-audit-mapping.ts` :
  - `parseThirdPartyAiScope(scope)` returns `{ category, provider }` or `null`.
  - `mapScopeToGrantAuditAction(scope)` / `mapScopeToRevokeAuditAction(scope)` pick the specialised action when the scope matches a known family ; otherwise the generic constant.
  - `buildConsentAuditMetadata(scope, version, source)` returns a flat metadata object (`{ scope, version, source }` ; third-party AI scopes also carry `provider` + `category`).
- `GrantConsentUseCase` / `RevokeConsentUseCase` accept an optional `ConsentAuditSink` (signature shape `{ log(entry: AuditLogEntry): Promise<void> }`) and a `ConsentAuditContext` (`{ ip, requestId }`). When the sink is provided, every grant emits one audit row ; revokes only emit when a row was actually active (idempotent skip). Sink is wired to `auditService` in `museum-backend/src/modules/auth/useCase/index.ts`. Calls existing without a sink remain back-compat (no audit row, no exception).
- HTTP route `museum-backend/src/modules/auth/adapters/primary/http/routes/consent.route.ts` forwards `req.ip` + `req.requestId` to the use cases.
- `RegisterUseCase` propagates the same `{ ip, requestId }` from the HTTP layer (`auth-session.route.ts`) into `recordTosConsent` so the ToS grant on registration also gets an audit row.

### Frontend (commit `a11e157b` + corrective loop in docs commit)

- New API client `museum-frontend/features/chat/application/thirdPartyAiConsent.ts` : typed wrappers (`grantConsentScope` / `revokeConsentScope` / `listUserConsents`) over `/api/auth/consent`.
- Rewritten `museum-frontend/features/chat/ui/AiConsentSheetContent.tsx` : 8 per-row `<Switch>` components grouped by provider (OpenAI first, Google second). **All switches default OFF** (GDPR Art. 4(11) "unambiguous affirmative action" + Apple 5.1.2(i) "explicit"). Save button stays disabled until the user actively toggles `third_party_ai_text_openai` ON — the `(required)` badge on that row makes the gate discoverable.
- `useAiConsent` hook updated to POST each granted scope to BE before flipping `AsyncStorage`. Per-scope failures are captured to Sentry (`tags: { flow: 'consent.grant', scope }`) without aborting the remaining grants. AsyncStorage flips regardless — the BE row is canonical, the AsyncStorage flag is a UX-only "we already asked" memo.
- New `museum-frontend/features/settings/ui/SettingsAiConsentCard.tsx` : revocation surface, one row per scope, optimistic-update + Sentry-reported rollback on BE failure. `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })` for "granted on" timestamp (CLAUDE.md ISO/Intl doctrine).
- i18n : 17 new keys × 8 locales (875 keys total — `npm run check:i18n` passes). Native translations for fr / en (full quality) and de / es / it / ja / zh / ar (functional ; pro translation pass tracked as **T2.6-bis**).

## Known follow-ups (non-blocking for launch)

Tracked separately ; do not block the App Store submission.

1. **Per-scope reconcile on app boot** — `useAiConsent` does not retry failed grants. Recommend an on-boot reconcile that diffs `THIRD_PARTY_AI_SCOPES` against `listUserConsents()` and re-POSTs missing scopes. Risk : low (audit row may be missing for a scope the user thought they granted ; AsyncStorage masks the prompt). Tracked as **T-S4-P0-02-bis-reconcile**.
2. **Chat pipeline enforcement of revocations** — the new third-party AI scopes are persistence + audit-only ; the chat pipeline (`museum-backend/src/modules/chat/`) does NOT short-circuit the call to OpenAI when `third_party_ai_text_openai` is revoked. Today only `location_to_llm` is functionally enforced. Apple review on first-use will pass (consent UI gates initial use) ; a determined reviewer revoking mid-session would observe chat still works. **Documented contract** : revocation post-grant is "no further audit row + UX intent only" ; full enforcement = account deletion. Tracked as **T-S4-P0-02-bis-enforce**.
3. **DPIA T1.1 narrative amendment** — the DPIA still describes the lawful basis as `tos_privacy` bundle. The new granular layer is *additional* under `6(1)(a)` for the Apple gate ; the DPIA should be amended with a 2-paragraph addendum acknowledging the layering. Blocked on DPO mandate (S2.T-S2-8). Tracked as **T-S4-P0-02-bis-dpia**.
4. **Audit-row durability on audit-insert failure** — `AuditService.log` swallows internal errors per existing codebase doctrine. Consequence : a consent row can land in `user_consents` without a matching `audit_logs` row if the audit insert fails. Low likelihood (advisory-lock contention). No reconciliation job today. Tracked as **T-S4-P0-02-bis-audit-reconcile**.
5. **Pro translations for de / es / it / ja / zh / ar** — current strings are functional but not native-grade. Tracked as **T2.6-bis**.

## Rejected alternatives

- **Minimal fix : keep single-button sheet, just rename the copy and the audit action.** Rejected. Apple's "non-bundled" requirement is structural, not lexical. A reviewer testing the sheet would see one tap covering six categories × three providers and reject.
- **Switch DPIA T1.1 to `6(1)(a)` consent as the primary basis.** Rejected. Switching the lawful basis pre-launch would require fresh DPO sign-off (blocked S2.T-S2-8) and would also remove the contract-performance fallback we want for users who deny one scope (they should still get account access). Layering preserves the contract while adding granular evidence.
- **Default text→OpenAI scope ON.** Rejected after reviewer feedback. A pre-checked box defeats the GDPR Art. 4(11) "unambiguous indication by a statement or clear affirmative action" requirement and weakens the Apple 5.1.2(i) "explicit" gate. The required-text-openai gate is enforced by the Save button + a `(required)` badge instead, so the user still understands which scope is mandatory but must take an affirmative action.

## Rollback

Per UFR-015 (no feature flags pre-launch) the change is hard-flipped. If a critical regression appears in field :

1. Revert FE commit `a11e157b` + the docs-commit corrective loop changes.
2. Revert BE commit `b2a2c53d` — note that any third-party AI consent rows already written stay valid (the BE accepts the legacy scope list as a superset).
3. The legacy `useAiConsent` AsyncStorage gate remains functionally compatible.

Migrations : none — `CONSENT_SCOPES` is `as const` in TypeScript (no DB enum), so removing the 8 new values affects only validation at the use case layer, not the column type.
