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
