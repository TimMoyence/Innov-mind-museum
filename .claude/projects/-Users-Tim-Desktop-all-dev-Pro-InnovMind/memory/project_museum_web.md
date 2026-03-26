---
name: museum-web package state
description: museum-web (Next.js 15) created in W1/W2 — landing page, admin panel, support, i18n FR/EN, deployment pipeline
type: project
---

## museum-web/ — nouveau package créé 2026-03-25

**Stack**: Next.js 15 App Router + Tailwind CSS 4 + Framer Motion + TypeScript strict
**Port**: 3001 (container) — backend reste sur 3000
**i18n**: FR/EN via middleware + dictionnaires JSON (path-based /[locale]/)

### Pages fonctionnelles (W2)
- `/` — Landing page marketing 6 sections animées (Framer Motion)
- `/support` — FAQ accordion + formulaire contact
- `/privacy` — Scaffold (contenu réel à migrer depuis docs/privacy-policy.html)
- `/admin` — Dashboard connecté à /api/admin/stats
- `/admin/users` — Table paginée + recherche + filtre rôle + change role
- `/admin/audit-logs` — Table paginée + filtre action
- `/admin/login` — JWT login avec refresh token interceptor

### Pages scaffold (pas encore connectées à l'API)
- `/admin/reports`, `/admin/analytics`, `/admin/tickets`, `/admin/support`

### Deployment pipeline
- `deploy/Dockerfile.prod` — multi-stage standalone, non-root
- `.github/workflows/ci-web.yml` — typecheck + build
- `.github/workflows/deploy-web.yml` — Docker + GHCR + VPS SSH
- Nginx: `/api/` → backend:3000, `/` → museum-web:3001

### À migrer de museum-admin/
museum-admin/ (Vite+React) est le précurseur. Les pages dashboard, users, audit-logs sont déjà migrées. Reste: le code de référence pour reports, analytics, tickets si les pages backend API sont finalisées.

**Why:** L'objectif est de remplacer le 444 nginx par une présence web professionnelle complète.
**How to apply:** Pour tout travail sur museum-web, considérer cet état comme baseline.
