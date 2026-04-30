# museum-web

Musaium web — Next.js 15 (App Router) + React 19 + Tailwind 4 + Framer Motion. Hosts the public landing page, GDPR privacy/support pages, password reset, and the operator admin panel.

## Setup

```bash
pnpm install
cp .env.example .env             # set API_BASE_URL to your backend
pnpm dev                         # http://localhost:3001
```

Backend must run on `http://localhost:3000` (see `museum-backend/README.md`). The Next dev server proxies `/api/*` to it via `next.config.ts` rewrites.

## Common scripts

| Script | What |
|---|---|
| `pnpm dev` | Next dev server on port 3001 |
| `pnpm build` | Production build (standalone output) |
| `pnpm start` | Start production server on port 3001 |
| `pnpm lint` | `eslint src/ && tsc --noEmit` |
| `pnpm typecheck` | `tsc --noEmit` only |
| `pnpm test` | Vitest run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with coverage |

## Required env vars

| Var | Purpose |
|---|---|
| `API_BASE_URL` | Backend base URL (server components + rewrites) |
| `NEXT_PUBLIC_SITE_URL` | Public canonical URL (OG/JSON-LD) |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `fr` (default) or `en` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking; empty = disabled |

## Structure

```
src/
  app/[locale]/          i18n routing (FR/EN)
    page.tsx               landing (8 animated sections)
    admin/                 7 admin pages (dashboard, users, analytics, tickets, audit-logs, reports, support)
    privacy/ support/ reset-password/
  components/marketing/    Framer Motion sections + JSON-LD blocks
  hooks/                   useAdminAuth, useApi, …
  lib/                     api client (with refresh-token interceptor), i18n loader, seo helpers
  middleware.ts            i18n routing
```

Path alias: `@/*` → `./src/*`.

## Deploy

Built as a Docker image, pushed to GHCR, deployed to OVH VPS via `.github/workflows/ci-cd-web.yml` on push to `main`. Lighthouse CI gates PRs at perf ≥ 0.85, a11y ≥ 0.90, SEO ≥ 0.90.

## More docs

- Ops & deploy — `../docs/OPS_DEPLOYMENT.md`
- CI/CD secrets — `../docs/CI_CD_SECRETS.md`
- CDN / Cloudflare — `../docs/CDN_CLOUDFLARE_SETUP.md`
