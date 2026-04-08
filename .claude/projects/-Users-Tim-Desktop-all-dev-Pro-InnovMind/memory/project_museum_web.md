---
name: museum-web package state
description: museum-web (Next.js 15) created in W1/W2 — landing page, admin panel, support, i18n FR/EN, deployment pipeline. Replaced museum-admin (deleted 2026-04-04).
type: project
---

## museum-web/ — package created 2026-03-25

**Stack**: Next.js 15 App Router + Tailwind CSS 4 + Framer Motion + TypeScript strict
**Port**: 3001 (container) — backend on 3000
**i18n**: FR/EN via middleware + JSON dictionaries (path-based /[locale]/)

### Functional pages (W2)
- `/` — Marketing landing page with 6 animated sections (Framer Motion)
- `/support` — FAQ accordion + contact form
- `/privacy` — Scaffold (real content to migrate from docs/privacy-policy.html)
- `/admin` — Dashboard connected to /api/admin/stats
- `/admin/users` — Paginated table + search + role filter + role change
- `/admin/audit-logs` — Paginated table + action filter
- `/admin/login` — JWT login with refresh token interceptor

### Scaffold pages (not yet API-connected)
- `/admin/reports`, `/admin/analytics`, `/admin/tickets`, `/admin/support`

### Deployment pipeline
- `deploy/Dockerfile.prod` — multi-stage standalone, non-root
- `.github/workflows/ci-web.yml` — typecheck + build
- `.github/workflows/deploy-web.yml` — Docker + GHCR + VPS SSH
- Nginx: `/api/` -> backend:3000, `/` -> museum-web:3001

### museum-admin (deleted 2026-04-04)
museum-admin/ (Vite+React) was the precursor. All pages (dashboard, users, audit-logs) were migrated to museum-web. The directory was removed as a strict duplicate with 0 tests vs museum-web's 12 tests and CI integration.

**Why:** Replace the nginx 444 with a professional complete web presence.
**How to apply:** museum-web is the only web admin panel. Any museum-admin reference in historical docs is archival only.
