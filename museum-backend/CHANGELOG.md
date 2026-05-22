# Changelog — museum-backend

All notable changes to the Musaium backend (+ cross-app legal/mobile changes shipped in the same run) are documented in this file.

Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The Musaium repo is a monorepo (`museum-backend/` + `museum-frontend/` + `museum-web/`) ; this changelog captures cross-app GDPR / compliance / launch-blocking changes when they are coordinated by a single run.

## [Unreleased] — 2026-05-21 — P0 GDPR closure lot

Run `2026-05-21-p0-gdpr` — eight P0 items shipped to verrouiller V1 launch (2026-06-01) against pre-launch GDPR + App Store + ePrivacy audit findings. Pipeline : UFR-022 fresh-context 5-phase / standard-enterprise / reviewer APPROVED weightedMean 89.45.

### Security (GDPR Art. 7 enforcement)

- **B6** — `third_party_ai_{text,image,audio}_{openai,google}` consent enforcement at the LLM dispatch site (chat pipeline) and the audio route. New `ThirdPartyAiConsentChecker` port mirroring the existing `LocationConsentChecker` pattern ; wired into `prepare-message.pipeline.ts` and `chat-media.route.ts` ; refusal returns a structured `kind: 'refused'` bubble (pipeline) or HTTP 403 + `AppError({code: 'CONSENT_REQUIRED', scope})` (audio route). Anonymous sessions = fail-CLOSED (D3 default). Multi-provider intersection-AND semantics (D2).
- **B7** — `POST /sessions/:id/audio` consent gate. Audio scope (`third_party_ai_audio_<provider>`) is now verified at route entry before any STT invocation ; previously the FE collected the toggle but the backend dispatched audio to OpenAI Whisper without checking.
- **I-SEC9** — `searchTerm` (user-typed chat text) dropped from `ExtractionJobPayload` in the BullMQ extraction queue. The field was enqueued by `enqueueForExtraction()` but ignored downstream (`processUrl(url, _searchTerm, locale)` discarded it) — dead PII retained in Redis for the BullMQ retention window. Now removed at the port boundary ; worker tolerant-destructures legacy jobs (R10 backward-compat).

### Compliance (GDPR Art. 13(1)(e) recipient disclosure)

- **B15** — Subprocessor list reconciled across the three public surfaces : 19 recipients (13 missing + DeepSeek-HTML-only added). New `/subprocessors` route on `museum-web` enumerates them with role, jurisdiction, contractual basis (DPA / SCC / adequacy).
- **B16** — Single canonical legal content source at `museum-backend/src/shared/legal/{privacy,terms}-content.canonical.json`. Three derivation pathways : `museum-web` imports directly, `museum-frontend` regenerated via `scripts/codegen-legal-content.mjs` (run by husky on canonical-touched commits), `docs/privacy-policy.html` maintained manually and verified by sentinel. New CI sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs` with comment-stripping pre-pass blocks any PR where a surface diverges. Corrected CNIL Délibération 2021-018 minor-age value (15 years, replacing the prior incorrect "16 ans" in HTML/FE). Architecture rationale recorded in ADR-062.
- **B18** — `museum-web` `/terms` route added + `/cookies` notice page (ePrivacy notice-only, no consent banner). The cookie-audit performed in-spec confirmed `museum-web` sets only strictly-necessary first-party cookies (`admin-authz`, `csrf_token`) and that the embedded Sentry SDK is configured without `replaysSessionSampleRate` / `profilesSampleRate` — no non-essential tracking cookies, banner not required. New CI sentinel `museum-backend/scripts/sentinels/web-cookies-audit.mjs` scans `museum-web/` for forbidden tracking SDK identifiers to preserve this stance.

### App Store

- **B10** — `museum-frontend/ios/Musaium/Info.plist` : `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` removed (when-in-use only matches `app.config.ts` declared scope). Sentinel added to prevent regression at build time.

### Internationalisation

- **I-CMP2** — 10 `consent.*` translation keys backfilled across 6 missing locales (`de`, `es`, `it`, `ja`, `zh`, `ar`) in `museum-frontend/locales/`. Brings 60 missing keys to zero ; consent UI now renders in the full locale matrix.

### Reclassified

- **I-SEC8** — Originally framed by the audit as a cross-tenant `museum_id` scoping leak in `artwork_knowledge`. Verification (2026-05-21) proved `artwork_knowledge` is a global scraped catalogue keyed by `(title, artist, locale)` with no tenant column ; the residual risk is self-inflicted only (client surfacing an irrelevant title in their own session prompt) and `sanitizePromptInput()` already mitigates the prompt-injection vector. Reclassified LOW, no code, no migration. Rationale + future V2 trigger conditions recorded in ADR-061.

### Architectural Decision Records

- ADR-061 — I-SEC8 reclassification (`artwork_knowledge` is not multi-tenant).
- ADR-062 — Canonical legal content source + drift sentinel.
