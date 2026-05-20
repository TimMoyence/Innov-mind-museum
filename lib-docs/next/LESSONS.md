# Lessons — next (v15.5.18)

Project-specific gotchas pour Next.js 15.5.18 App Router dans museum-web. Audit enterprise-grade 2026-05-18.

## 2026-05-18 — Missing `error.tsx` / `loading.tsx` / `not-found.tsx` (MEDIUM)
- **Symptôme** : errors thrown in async Server Components bubble to Next default error UI (générique). Pas de streaming UX pour pages lentes. 404 fall to default.
- **Cause** : `find museum-web/src/app -name 'error.tsx' -o -name 'loading.tsx' -o -name 'not-found.tsx'` returns 0. Admin pages dependent on `apiGet` n'ont pas de error boundary.
- **Fix** : voir TD-NEXT-01. Add at minimum :
  - `app/[locale]/not-found.tsx` (404 page localisée FR/EN)
  - `app/[locale]/admin/error.tsx` (admin error boundary)
  - `app/[locale]/admin/loading.tsx` (streaming skeleton)
- **Anti-pattern à éviter** : laisser une route segment sans error.tsx si elle peut throw.

## 2026-05-18 — Missing `generateStaticParams` for `[locale]` (LOW)
- **Symptôme** : `app/[locale]/layout.tsx` + `app/[locale]/page.tsx` lancent dictionary fetch per request. Locales FR/EN connues à build → prerender possible.
- **Cause** : 0 occurrences de `generateStaticParams` dans src/. Cold path runs full RSC + dictionary load on chaque request → TTFB ↑ + edge cost ↑.
- **Fix** : voir TD-NEXT-02. Add `generateStaticParams` returning `[{locale:'fr'},{locale:'en'}]` dans `app/[locale]/layout.tsx`.
- **Anti-pattern à éviter** : route `[param]` avec set connu fini sans `generateStaticParams`.

## 2026-05-18 — `server-only` / `client-only` guards manquants (LOW prophylactique)
- **Symptôme** : pas de leak actuel (NEXT_PUBLIC_SITE_URL seul env côté client) mais pas de compile-time guard si secret module ajouté dans le futur.
- **Cause** : 0 occurrences `import 'server-only'` ou `import 'client-only'`. `lib/auth.tsx` est client module ('use client') référencé via cookie name only — pas de leak observable.
- **Fix** : add `import 'server-only'` proactivement à tout nouveau module qui hold secrets (env vars server-side, DB credentials, API keys).
- **Anti-pattern à éviter** : importer accidentellement un module server-side dans un Client Component (entrée silencieuse de secrets côté client bundle).

## 2026-05-18 — Validations positives (conformité confirmée)
- ✅ **v15 vs v16 deltas** :
  - `middleware.ts:126` (v15 canonical, NOT `proxy.ts` v16)
  - 0 occurrences `PageProps`/`LayoutProps`/`RouteContext` (v16-only helpers)
  - 0 imports `refresh` from `next/cache` (v16-only)
  - 0 `'use cache'` directive (v16-only)
  - 0 `next typegen` CLI invocation
- ✅ **v15 breaking changes**:
  - **Async params** : tous pages/layouts typent `Promise<...>` + await (e.g. `app/[locale]/layout.tsx:8-12`, `app/[locale]/admin/users/[id]/page.tsx:16`)
  - **Async headers** : `app/layout.tsx:28 const headersList = await headers()`
  - **next/font canonical** : `app/layout.tsx:2 import { Inter } from 'next/font/google'` (no `@next/font`)
  - **No experimental.edge** : 0 occurrences
- ✅ **Server Components by default** : pages/layouts under `app/[locale]/*`, `/privacy/`, `/security/`, `/b2b/`, `/support/` tous async Server Components. `'use client'` confined to 41 interactive leaf components.
- ✅ **Push 'use client' to leaves** : landing page RSC compose client islands (HeroPlayerLoader, LandingHero).
- ✅ **Metadata** : static `metadata` dans `app/layout.tsx:12-25` (template + metadataBase + icons) + `generateMetadata` dans `app/[locale]/page.tsx:23` awaiting params + dictionary.
- ✅ **i18n with App Router** : `[locale]` segment + `getDictionary(locale)` + middleware sets `x-locale` header + root layout reads `await headers().get('x-locale')`.
- ✅ **CSP / security headers** : per-request nonce dans `middleware.ts:43-52` + `buildCspHeader` (strict-dynamic, no `unsafe-inline` sur script-src) ; static headers (HSTS, X-Frame-Options DENY, Permissions-Policy) dans `next.config.ts:7-15 headers()`. Split static/per-request correct.
- ✅ **Image priority above-the-fold** : `LandingHero.tsx:31-38` logo with explicit width/height/priority.
- ✅ **No raw `<img>` / `<a href>`** : 0 occurrences (next/image + next/link partout).

## 2026-05-18 — Choix conscient : admin est full 'use client'
- **Site** : `app/[locale]/admin/page.tsx:1 'use client'` — entire dashboard client-rendered avec `apiGet` in useEffect.
- **Justification** : admin = auth-walled SPA avec live mutations. Full RSC + Server Actions refactor = scope plus large que justifié.
- **Status** : décision documentée, NOT une violation.

## 2026-05-20 — CVE-2025-29927 status : PATCHED + posture middleware correcte (verified)
- **Contexte** : middleware authz bypass via header forgé `x-middleware-subrequest` (CVSS 9.1). Patché en 15.x à partir de **15.2.3**.
- **Status projet** : museum-web pin **15.5.18 ≥ 15.2.3 → PATCHED** (vérifié `npm view next dist-tags` : 15.5.18 = backport channel, latest 15.5.x). Le skip framework-level est fermé.
- **Defense-in-depth ✅** : `src/middleware.ts:18-24,115-124` — le cookie `admin-authz` est explicitement un *UX redirect hint*, PAS une frontière de sécurité ; le backend valide le JWT sur chaque `/api/admin/*`. Posture correcte (middleware n'est jamais l'authz seule).
- **Hardening optionnel** : strip `x-middleware-subrequest` entrant au niveau nginx/VPS (belt-and-suspenders, non bloquant).
- **Anti-pattern à éviter** : implémenter une vraie authz dans le middleware. Même post-patch, c'est fragile.

## 2026-05-20 — `unstable_retry` est v16.2.0 — v15 utilise `reset` (delta corrigé)
- **Symptôme potentiel** : copier un exemple error.tsx des docs v16.2.6 (canonical) qui type `unstable_retry: () => void`.
- **Cause** : Version History de `/file-conventions/error` : `v16.2.0 unstable_retry prop added`. v15.5.18 n'a que `reset`.
- **Fix** : `app/global-error.tsx:6-11` utilise correctement `reset` (vérifié). Tout nouveau error.tsx DOIT typer `{ error: Error & {digest?:string}; reset: () => void }`.
- **Anti-pattern à éviter** : `unstable_retry` dans du code v15.

## 2026-05-20 — TD-NEXT-02 CLOSED : `generateStaticParams` présent (re-verified)
- **Status** : `app/[locale]/layout.tsx:14-16` exporte `generateStaticParams()` → `[{locale:'fr'},{locale:'en'}]`. FR/EN prerendered au build. TD-NEXT-02 fermé (contrairement au snapshot 2026-05-18 qui le listait LOW open).
- **Note** : c'est la SEULE occurrence de `generateStaticParams` (grep). Pas d'autre segment `[param]` fini non-prerendered à risque.

## 2026-05-20 — TD-NEXT-01 TOUJOURS OUVERT : zéro error/loading/not-found par-segment (MEDIUM)
- **Symptôme** : `find src/app -name 'error.tsx' -o -name 'loading.tsx' -o -name 'not-found.tsx'` = **0 fichiers**. Seul `app/global-error.tsx` existe (catch root layout only).
- **Impact** : admin pages (`apiGet` in useEffect, peuvent throw) bubble au global-error générique ; pas de 404 localisée ; pas de skeleton streaming. C'est l'écart le plus actionnable.
- **Fix prioritaire** (par valeur décroissante) :
  1. `app/[locale]/admin/error.tsx` (`'use client'`, `reset`, Sentry.captureException in useEffect) — admin fetch peut throw.
  2. `app/[locale]/not-found.tsx` (404 localisée FR/EN).
  3. `app/[locale]/admin/loading.tsx` (skeleton streaming).
- **Anti-pattern à éviter** : route segment qui throw sans error boundary → UX générique + Sentry non capté côté segment.

## 2026-05-20 — `apiPut` re-implémenté localement (CLAUDE.md gotcha confirmé, 1 site)
- **Site** : `app/[locale]/admin/museums/[id]/branding/page.tsx:60-90` — wrapper `fetch` PUT local (CSRF cookie→`X-CSRF-Token`, `credentials:'include'`) car `src/lib/api.ts` n'expose que GET/POST/PATCH/DELETE.
- **Status** : 1 seul site pour l'instant → toléré. **Au 2e site PUT → ajouter `apiPut` dans `api.ts`** (réutilise `request()` qui gère déjà CSRF + refresh queue + 401 retry).
- **Anti-pattern à éviter** : 3e copie du wrapper. Le wrapper local ne bénéficie PAS du refresh-on-401 de `api.ts`.

## 2026-05-20 — Tailwind 4 = CSS-first, aucun `tailwind.config.*` (ne pas en créer)
- **Setup vérifié** : `src/app/globals.css:1 @import 'tailwindcss';` + `postcss.config.mjs` plugin `@tailwindcss/postcss`. Pas de fichier config JS.
- **Anti-pattern à éviter** : créer un `tailwind.config.ts` (réflexe Tailwind 3) — config se fait via `@theme {}` en CSS. Interaction CSP : inline styles (Framer Motion/next/font/Tailwind arbitrary variants) imposent `style-src 'unsafe-inline'` (script-src reste strict-nonce).
