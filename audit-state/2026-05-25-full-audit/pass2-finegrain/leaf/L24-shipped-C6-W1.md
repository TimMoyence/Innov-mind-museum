# L24 — Audit shipped P0.F clusters C6–C10 + W1

**Agent**: L24 fresh-context READ-ONLY (UFR-022). Branch `dev` @ `1fb32f5ba`. Zero prior context — all verdicts re-derived from code.
**Scope**: `docs/ROADMAP_PRODUCT.md` §P0.F lines 167-189 + V1.0.x line 291 (ChooseAnother).
**Method**: each claim confirmed by `path:line`. No "shipped" trusted on faith.

---

## C6 — Paywall stub + quota + tier + admin override → **SHIPPED-CONFIRMED**

- **C6.2 quota middleware**: `museum-backend/src/shared/middleware/monthly-session-quota.middleware.ts:133-170`. Atomic single `UPDATE…WHERE` (no read-then-write race), fail-OPEN on unwired repo (`:144`) and premium bypass (`:152`), 402 `QUOTA_EXCEEDED` body (`:122-131`), per-(userId,month) dedup log (`:77`), `quota_exceeded` telemetry emit (`:99`). Limit default 3 (`:70`).
- **Wiring**: `chat-session.route.ts:107` mounts `monthlySessionQuota` AFTER `validateBody(createSessionSchema)` (`:106`) — correct ordering (mutating-middleware-after-validator gotcha respected, comment `:100-102`).
- **C6.3 tier domain**: `auth/domain/user/user-tier.ts` (FREE/PREMIUM). Repo `monthly-session-quota.repo.pg.ts` present.
- **C6.4 admin override**: `admin.route.ts:124` `PATCH /users/:id/tier` gated `requireRole('super_admin')` (`:126`) + `validateBody(changeUserTierSchema)`. `changeUserTier.useCase.ts` present. (Roadmap text says `/api/admin/users/:id/tier`; actual route path is `/users/:id/tier` under admin router — functionally identical, mounting prefix adds `/api/admin`.)
- **C6.1 FE stub**: `PaywallProvider` + `QuotaUpsellModal` mounted `app/_layout.tsx:179,100`. 402 interceptor `shared/infrastructure/httpClient.ts:270` → `setPaywallHandler` (`:71,280`) fires only on `code:'QUOTA_EXCEEDED'`. Dev preview route `app/(dev)/paywall-preview.tsx`.
- Migration `1778900000000-AddUserTier.ts` present.

**Verdict: SHIPPED-CONFIRMED.** End-to-end chain (BE atomic gate → 402 → FE interceptor → modal → admin tier flip) verified.

---

## C7.1 — smoke:api e2e coverage → **SHIPPED-CONFIRMED**

`museum-backend/scripts/smoke-api.cjs` (script `package.json:26`). Real assertions on: `/api/health` (18 retries), `/api/auth/login` (200|401), `/api/auth/register` (201|409), `/api/auth/consent` (201), `/api/chat/sessions` create (201) + list (200), `/api/chat/compare` multipart (200|503 contractual, asserts `COMPARE_ENCODER_UNAVAILABLE` on 503), `/api/chat/sessions/:id/messages` (201, asserts role=assistant), `/api/chat/messages/:id/tts`. Status-code assertions enforced (`:90,147,218`). Not a stub.

**Verdict: SHIPPED-CONFIRMED.**

---

## C9 — voice/audio cluster → **SHIPPED-CONFIRMED** (sample)

- **C9.10 voiceMode 80w**: `chat/useCase/llm/llm-sections.ts:149` `if (voiceMode) return 80;` overrides audioDesc+museum word limits (`:107-111`).
- **C9.12 TTS Opus**: `chat/adapters/secondary/audio/text-to-speech.openai.ts:46` `response_format:'opus'`. Langfuse span `synthesizing-voice` (`:161`).
- **C9 cache key v2 incl currentArtwork**: `llm-cache.service.ts:164` `currentArtworkKey` in canonical key (corroborates I-FIX2, gotcha v2 namespace). NOT re-derived in depth — out of leaf scope, but consistent.
- **C9.14 SigLIP-2**: PRIMARY adapter `embeddings/siglip-onnx.adapter.ts:30` `SIGLIP_MODEL_VERSION='siglip2-base-patch16-224@v1'`, 768-d L2-norm (`:34,142`). Honesty note ACCURATE: Replicate fallback lags to SigLIP-v1 (`embeddings.factory.ts:20-28`, distinct `modelVersion`, cross-compare unsupported by design — not a hidden defect).
- **C9.2 audioDescriptionMode autoplay**: store `settings/infrastructure/audioDescriptionStore.ts` + `useAutoTts.ts` + `useTextToSpeech.ts` present and wired into chat send strategies.
- **C9.3 granular consent**: `chat/domain/consentScopes.ts` — per-vendor third-party-AI scopes + `location_to_llm` coarse-location scope (`:13-17`), round-tripped `/api/auth/consent`. `AiConsentSheetContent.tsx` + `useAiConsent.ts` present.
- **C9.3b AI Act Art.50 badge**: `AiDisclosureFooter.tsx` mounted persistently `ChatSessionSurface.tsx:92`; disclosure sheet opener `chat/[sessionId].tsx:363,476`. (Contrast bug I-CMP1 separately fixed #298 per roadmap.)

**Verdict: SHIPPED-CONFIRMED** for sampled items. No orphan/partial found in C9 sample.

---

## C10 — chat UX refonte → **SHIPPED-CONFIRMED** (components) / **1 PARTIAL** (ChooseAnother)

All C10 UI components exist in `features/chat/ui/`: `Composer.tsx`, `ArtworkHeroCard.tsx`/`ArtworkHeroModal.tsx`, `ChatMessageBubble.tsx`, `CollapsibleTopBar.tsx`, `StatusIndicator.tsx`, `CitationChip(s).tsx`/`SourceCitation.tsx`, `CarnetSessionCard.tsx`, `ConversationResumptionBanner.tsx`, `ProactiveMuseumBanner.tsx`.
- Carnet route `app/(stack)/carnet.tsx:113` + `carnet/[sessionId].tsx`.
- Resumption: `useResumableSession` + `ConversationResumptionBanner` mounted `home.tsx:44,85`.
- Proactive: `useProactiveMuseumSuggestion` + `ProactiveMuseumBanner` mounted `home.tsx:45,96`.

### ⚠️ C10 ChooseAnother → **PARTIAL (NOT fully wired)** — matches roadmap open item L291

- Component `ProactiveMuseumBanner.tsx` HAS the ChooseAnother button: `handleChooseAnotherPress` (`:75-83`), prop `onChooseAnother` (`:46`). Confirm-band (confidence ∈ (0.5,0.8], `:83-136`) renders it (`:133`).
- **Contract gap**: component doc (`:44`) says *"When omitted in the confirm band, the button falls back to `onDismiss`."*
- **home.tsx mounts the banner WITHOUT `onChooseAnother`** (`home.tsx:96-109` passes only `museum`, `onStart`, `onDismiss`). → pressing ChooseAnother silently DISMISSES instead of routing to the picker.
- A real picker route EXISTS and is unused by this path: `app/(stack)/museums-picker.tsx` → `MuseumPickerScreen`. So the fix is a 1-prop wiring (`onChooseAnother={() => router.push('/(stack)/museums-picker')}`), not a missing screen.

**Verdict C10: SHIPPED-CONFIRMED for the UX components; ChooseAnother medium-confidence band = PARTIAL (roadmap L291 accurate, not yet closed at `1fb32f5ba`).**

---

## W1 — intra-musée cluster → **SHIPPED-CONFIRMED**

- **W1.4 museum-choice UX**: `app/(stack)/museums-picker.tsx` → `features/museum/ui/MuseumPickerScreen` (`onSelect`/`onClose`, `router.back()` dismiss). Mounted route.
- **W1.5 geofence (hybrid postgis + jsonb-bbox)**: `museum/adapters/secondary/pg/museum.repository.pg.ts:23` `GeofenceMode='postgis'|'jsonb-bbox'|'absent'`; `findByCoords` PostGIS `ST_Contains(geofence, ST_SetSRID(ST_Point…,4326))` GIST (`:144`) with jsonb-bbox in-app fallback (`:152`), bootstrap-cached mode pick. `detect-museum.useCase.ts:40-44` geofence-containment short-circuit → confidence 1.0 strategy `geofence`, haversine radial fallback. Migrations `1779051738966-AddMuseumGeofence.ts` + `1779051850000-SeedPilotMuseumGeofences.ts` present.
- **W1.6 QR-deeplink + [CURRENT ARTWORK]**: full chain wired —
  - Scanner `features/chat/ui/CartelScannerSheetContent.tsx` `<CameraView onBarcodeScanned>` (`:51,88`) parses `musaium://museum/<uuid>/artwork/<uuid>?room=<uuid>` deeplink (`:31,94`) + legacy `ABC-123` cartel via `sanitizeCartelCode` (`:102`).
  - FE session update `chat/[sessionId].tsx:396` `currentArtworkId: payload.artworkId`.
  - BE schema accepts it: `chat-session.schemas.ts:181` + refine requires artworkId OR room (`:186`). Context update `update-session-context.useCase.ts:48`.
  - LLM injection: `prepare-message.pipeline.ts:317-320` `resolveCurrentArtwork(session)` → `[CURRENT ARTWORK]` prompt block (`:45-51`).
  - (Custom-scheme + universal-link routing infra `app/+native-intent.tsx` exists; that handler maps magic-link auth paths — the artwork deeplink is consumed in-app by the scanner, not the OS intent. Canonical `/museum/[id]/artwork/[artworkId]` route is V1.1-deferred per roadmap C9.18, fallback `/museum-detail` — consistent, not a contradiction.)

**Verdict W1: SHIPPED-CONFIRMED.**

---

## Summary of verdicts

| Cluster | Verdict | Key path:line |
|---|---|---|
| C6.1-C6.4 paywall/quota/tier/override | SHIPPED-CONFIRMED | quota mw `monthly-session-quota.middleware.ts:133`; wire `chat-session.route.ts:107`; admin `admin.route.ts:124-126`; FE `_layout.tsx:100,179` |
| C7.1 smoke:api | SHIPPED-CONFIRMED | `scripts/smoke-api.cjs` (8+ endpoints, real assertions) |
| C9 (voiceMode/Opus/SigLIP-2/audio-desc/consent/AI-badge) | SHIPPED-CONFIRMED | `llm-sections.ts:149`; `text-to-speech.openai.ts:46`; `siglip-onnx.adapter.ts:30`; `ChatSessionSurface.tsx:92` |
| C10 UX components | SHIPPED-CONFIRMED | all in `features/chat/ui/`, mounted |
| **C10 ChooseAnother** | **PARTIAL** | comp has it `ProactiveMuseumBanner.tsx:75,46`; **home.tsx:96-109 omits `onChooseAnother`** → falls back to dismiss. Picker route `museums-picker.tsx` exists unused. |
| W1.4 museum picker | SHIPPED-CONFIRMED | `museums-picker.tsx` → `MuseumPickerScreen` |
| W1.5 geofence postgis+jsonb-bbox | SHIPPED-CONFIRMED | `museum.repository.pg.ts:23,144,152`; `detect-museum.useCase.ts:40` |
| W1.6 QR-deeplink + [CURRENT ARTWORK] | SHIPPED-CONFIRMED | `CartelScannerSheetContent.tsx:94`; `prepare-message.pipeline.ts:317` |

**No shipped claim found to be ORPHAN or fabricated in this sample.** The single PARTIAL (ChooseAnother) is already accurately tracked open at `docs/ROADMAP_PRODUCT.md:291`. Roadmap §P0.F honesty holds for the audited clusters.
