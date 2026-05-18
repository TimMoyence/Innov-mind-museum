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
