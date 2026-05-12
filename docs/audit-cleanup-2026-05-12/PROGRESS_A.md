# PROGRESS_A — Agent A (GDPR/AI-Act compliance + PII leak)

Sprint: audit-cleanup-2026-05-12
Owner: Agent A
Started: 2026-05-12

## Checklist status

- [x] A.1 — Sentry scrubbers alignés (PII leak fermé)
  - Files: `museum-backend/src/shared/observability/sentry-scrubber.ts`, `museum-frontend/shared/observability/sentry-scrubber.ts`, `museum-web/src/lib/sentry-scrubber.ts`
  - Verif: les 3 fichiers exposent la même `SENSITIVE_QUERY_KEYS` (7 clés alphabétiques: access_token, api_key, apikey, password, refresh_token, secret, token). `SENSITIVE_HEADER_REGEX` et `SENSITIVE_FIELD_REGEX` déjà alignés (vérifié par lecture). Commentaire SOURCE-OF-TRUTH ajouté en tête des 3 fichiers.
  - Commit: <pending>

- [ ] A.2 — Wire grantConsentUseCase + migration
- [ ] A.3 — AI Act Art.50 disclosure
- [ ] A.4 — Age-gate 15 ans
- [ ] A.5 — DPIA
- [ ] A.6 — ROPA
- [ ] A.7 — .env.production.example cleanup
- [ ] A.8 — Test e2e consent
- [ ] A.9 — Final commits + report
