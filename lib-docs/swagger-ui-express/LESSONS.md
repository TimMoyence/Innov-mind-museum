# Lessons — swagger-ui-express (v5.0.1)

Audit 2026-05-18 : **APPROVED** — implementation conservative-by-default.

## ✅ Configuration exemplaire (security-first)
- **Prod-disabled** : `app.ts:224 if (!isProd) { setupSwagger(app); }` — Swagger UI NEVER mounted in production. Mitigates spec disclosure + try-it-out abuse. Stronger than PATTERNS guidance.
- CSP exemption N/A : helmet `contentSecurityPolicy: false` quand !isProd, never coexists with /api/docs in prod
- serve+setup ordering correct (`app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiSpec()))`)
- Spec loaded server-side from `openapi/openapi.json` (no public `/openapi.json` endpoint)
- ZERO deprecated flags (useUnsafeMarkdown, queryConfigEnabled, clientSecret)

## ⚠️ F1 LOW : Missing `customSiteTitle` + `validatorUrl:null`
- Default 'Swagger UI' tab title in dev.
- **Fix TD-SW-01** : `setup(doc, { customSiteTitle: 'Musaium API', swaggerOptions: { validatorUrl: null, persistAuthorization: true } })`.

## Status : NO BLOCKER. F1 cosmetic improvement.

## 2026-05-20

Re-audit (lib-doc-curator UFR-022, swagger-ui-express@5.0.1, bundled swagger-ui-dist@5.21.0 verified). **VERDICT: APPROVED — reference-grade, no blocker.**

### Verified facts (vs 2026-05-18)
- `app.ts:270` confirms prod-gating still in place: `if (!isProd) { setupSwagger(app); }`. Swagger UI NEVER mounted in production → no prod exposure, no CSP collision.
- F1 (2026-05-18) is RESOLVED: `swagger.ts:24` now sets `customSiteTitle: 'Musaium API'` + `swaggerOptions: { validatorUrl: null, persistAuthorization: true }` (TD-SW-01 shipped).
- Spec loaded server-side from static `openapi/openapi.json` at boot (`swagger.ts:8-13`) — no public `/openapi.json` and no `swaggerOptions.url` → the historical DOM-XSS `?url=`/`queryConfigEnabled` vector is not exposed.
- Prod CSP `scriptSrc: ["'self'"]` (no `'unsafe-inline'`, `app.ts:84`) is SAFE precisely because swagger's inline boot script never runs in prod. **Do not add `'unsafe-inline'` to make docs work** — gate them or migrate to self-hosted Scalar instead.

### CSP gotcha (key takeaway)
Swagger UI boots via an inline `<script>` calling `SwaggerUIBundle(...)`. If anyone ever needs `/api/docs` in prod under the current strict CSP, it will render BLANK. The wrong fix is global `script-src 'unsafe-inline'` (defeats CSP app-wide). Right fixes: per-route nonce/relaxed CSP, or self-hosted Scalar bundle (keeps `script-src 'self'`). Wave-3 helmet note about swagger CSP is moot today because docs are prod-disabled.

### Security advisories reviewed
- swagger-ui DOM XSS (3.14.1–3.38.0): **NOT AFFECTED** — bundles swagger-ui-dist@5.21.0.
- CVE-2025-48050 (dompurify ≤3.2.5, CVSS 7.5): path traversal in dompurify's dev-only `scripts/server.js`, not a browser-runtime sanitizer bypass, not reachable via the served UI. LOW.
- swagger-ui-express upstream stalled (no npm release 12+ mo). Security tracking must target `swagger-ui-dist`, NOT the wrapper version. Reinforces TD-32 (Scalar migration).

### TD-32 (Scalar) note
Migration is the right call for maintenance + strict-CSP friendliness (self-host bundle → no jsdelivr in `script-src`). Keep the `!isProd`/auth gate identically; Scalar exposes the same API surface.

