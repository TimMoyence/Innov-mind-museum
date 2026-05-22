# Lessons — helmet (v8.1.0)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 🚨 2026-05-18 — F1 MEDIUM : helmet mount APRÈS rateLimit → 429 sans security headers
- **Cause** : `museum-backend/src/app.ts:100-130 applyGlobalMiddleware` order = requestId → requestLogger → cors → rateLimit → helmet → compression. 429 / log-only responses ship sans CSP, HSTS, X-Content-Type-Options, X-Frame-Options.
- **Fix** : voir TD-HEL-01. Move `helmet(buildHelmetOptions(isProd))` immediately after requestId (line 100), avant requestLogger + rateLimit.

## 🚨 2026-05-18 — F3 HIGH : CSP `connect-src: ['self']` trop narrow
- **Symptôme** : silent breakage runtime pour fetch/XHR/WS beyond same-origin → admin HTML pages avec Sentry browser SDK, OpenAI/DeepSeek API, Stripe (futur) seront bloqués.
- **Fix** : voir TD-HEL-02. Extend `connectSrc: ['self', 'https://*.sentry.io', 'https://o*.ingest.sentry.io', 'https://api.openai.com', 'https://api.stripe.com']`. Audit actual browser-side network calls avant launch. CSP Evaluator validation (PATTERNS.md:182).

## ⚠️ 2026-05-18 — F4 MEDIUM : CSP `img-src` manque CloudFront / museum.com
- **Symptôme** : artwork thumbnails via CloudFront ou museum-canonical CSP-blocked.
- **Fix** : voir TD-HEL-03. Add `https://*.cloudfront.net`, `https://musaium.com`, `https://*.musaium.com`, `https://upload.wikimedia.org` (si used).

## 2026-05-18 — LOW : `unsafe-inline` style-src kept as Phase 2 follow-up
- `app.ts:83 styleSrc: ['self', 'unsafe-inline']` — comment 'stop-gap; remove once admin CSS migrates off inline tag styles'.
- Default helmet style-src includes `https:` — override LOST that. Re-add OR accept tightening.

## 2026-05-18 — Polish : add CSP reportOnly mode pour bake en prod
- Pre-launch acceptable mais post-launch, ajouter CSP_REPORT_ENDPOINT env + report-to directive → telemetry sur tightening before flip.
- Mirror project bake-en-prod ≥7j doctrine.

## 2026-05-20 — Refresh wave (doc-curator UFR-022)

### Verified fixed in code (TD-HEL-01..03 closed)
- **TD-HEL-01** (helmet AFTER rateLimit) → CLOSED. `museum-backend/src/app.ts:128-133` now mounts helmet at position 2 (after `requestIdMiddleware`, BEFORE rate-limit `:156` and `express.json` `:177`). Codified as DO rule PATTERNS.md §3.1.
- **TD-HEL-02** (`connect-src: ['self']`) → CLOSED. `app.ts:107-113` extended with Sentry (`*.sentry.io`, `o*.ingest.sentry.io`), OpenAI (`api.openai.com`), Stripe (`api.stripe.com`).
- **TD-HEL-03** (`img-src` missing CDN/Wikimedia) → CLOSED. `app.ts:92-101` includes `*.cloudfront.net`, `musaium.com`, `*.musaium.com`, `upload.wikimedia.org`, plus existing S3 entries.

### Newly surfaced

- **TD-HEL-04 (open, MEDIUM) — no `Permissions-Policy` header set**. Helmet does NOT ship a Permissions-Policy middleware (verified 2026-05-20 against upstream README + repo listing). Voice V1 (`docs/AI_VOICE.md`) plus walking-guide V2 (geolocation) need it. Choose between standalone `permissions-policy` package OR hand-rolled middleware — see PATTERNS.md §7. Recommended baseline: `geolocation=(self), camera=(self), microphone=(self), payment=(), fullscreen=(self), autoplay=(self), accelerometer=(), gyroscope=(), magnetometer=(), usb=(), serial=(), hid=(), interest-cohort=()`. Scope per-route override on `/api/chat/voice/**` so non-voice surfaces hard-deny microphone (defence in depth — even on XSS, JS can't `getUserMedia`).

- **TD-HEL-05 (open, LOW) — security-header regression coverage**. `museum-backend/tests/unit/routes/cors.test.ts:101-102` is the ONLY assertion on helmet output and it covers `x-content-type-options` only. No regression test exists for TD-HEL-01 (helmet runs BEFORE rate-limit → security headers must be present on 429), CSP shape, HSTS preload triplet, or `frame-ancestors 'none'`. Snippet template in PATTERNS.md §8. Pre-V1 nice-to-have ; post-V1 a regression here is silently exploitable.

### Unchanged but worth re-flagging

- **`styleSrc: ['self', 'unsafe-inline']`** still in production CSP at `app.ts:87`. Comment says "stop-gap; remove once admin CSS migrates off inline tag styles". Tracker: Phase 2 follow-up. Default helmet `style-src` includes `https:` which is dropped by this override — re-add if the inline-style audit hasn't yet completed when admin HTML ships.

- **CSP `report-to` / `report-uri` not configured** in any environment. Mirrors "polish 2026-05-18" entry above. Post-launch, set `report-to` (CSP3 modern) + `report-uri` (legacy fallback) → ingest into Sentry or a dedicated `/api/csp-report` route. Required for the bake-en-prod ≥7j doctrine to surface real-world CSP violations before tightening further.

- **HSTS `preload: true` is a near-irreversible commitment** (hstspreload.org: "months for a change to reach users with a Chrome update"). Musaium ships `maxAge: 63_072_000` + `includeSubDomains` + `preload` per OWASP 2026 baseline. If musaium.com is ever served via HTTP on any subdomain post-preload-submission, that subdomain breaks for all preloaded clients. Verify subdomain HTTPS coverage before submission to https://hstspreload.org/?domain=musaium.com.

### Upstream status

- helmet `^8.1.0` remains current-latest (verified 2026-05-20). No release since 2025-03-17 ; no open security advisory ; no upgrade action.
- v8 → v9 not announced.
