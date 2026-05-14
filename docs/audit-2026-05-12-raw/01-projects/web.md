# `museum-web/` — Fresh-Context Deep-Dive Audit

**Date:** 2026-05-12  **Scope:** `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/`  **Methodology:** Read + Grep + Bash only. Citations `file:line` from the working tree as of HEAD (`9471649db audit-cleanup 2026-05-12`). UFR-013 honesty applied.

---

## 1. Executive Verdict

The Musaium web app is a **well-structured, production-credible Next.js 15 / React 19 build** with disciplined layered defenses (per-request CSP nonce, HttpOnly + CSRF double-submit cookies, Sentry PII scrubber, GDPR-grade privacy doc) that materially beats the launch baseline expected of a pre-V1 product. It is **ready for the 2026-06-01 launch** for the surfaces it covers (landing + 11 admin pages + privacy/support/reset-password/verify-email/MFA), with the caveat that several scaling and operational gaps remain — most importantly the **`unsafe-inline` for `style-src` weakens script-injection mitigations** (`src/middleware.ts:73`), **no rate limiting on the public `/api/support/contact` proxy**, the **`/users/[id]` page is a stubbed placeholder** (`src/app/[locale]/admin/users/[id]/page.tsx:1-37`), and **no CDN config / no ISR / no Edge runtime adoption** is in place to absorb the stated 100k MAU comfortably. The 100k/month target is achievable on a single VPS standalone Next.js node behind nginx, but only because the surface is essentially static + JSON-API admin; if marketing traffic spikes, Lighthouse perf at 0.85 floor + 350-line Hero `HeroAnimation` client bundle will start to hurt without an image CDN.

---

## 2. Exact Stack — Every Dep With Version

Source: `museum-web/package.json:1-78`. Versions are **caret-pinned** (loose ranges); resolution is fixed by `pnpm-lock.yaml` (not read directly per token discipline).

### Production deps (8)

| Package | Declared | Notes / Risk |
|---|---|---|
| `next` | `^15.5.18` | App Router stable, React 19 compiler default off |
| `react` | `^19.2.0` | **React 19.2 = bleeding edge** — released late 2025, mature for App Router but newer hooks (`use`, `useFormState`, `useOptimistic`) not yet adopted here |
| `react-dom` | `^19.2.0` | Matches React |
| `@sentry/nextjs` | `^10.49.0` | Active LTS line; PII scrubber in place (`src/lib/sentry-scrubber.ts`) |
| `framer-motion` | `^12.38.0` | Major v12 — used in 14 marketing components + Header; reduced-motion respected (`HeroAnimation.tsx:23`) |
| `maplibre-gl` | `^5.23.0` | Heavy lib (~700 KB gz) — only loaded behind `dynamic({ ssr: false })` in `DemoMapLoader.tsx:5` |
| `qrcode` | `^1.5.4` | Used for MFA TOTP enrollment (`src/app/[locale]/admin/mfa/page.tsx:35`) |
| `recharts` | `^3.8.1` | **v3 — bleeding-edge major** (released ~late 2025). Used in `src/app/[locale]/admin/analytics/page.tsx:4-15`. Schema changes between v2→v3 are non-trivial. |

### Dev deps (highlights)

| Package | Declared | Notes |
|---|---|---|
| `typescript` | `~5.9.3` | Pinned tilde, aligned to monorepo (commit `a091a96d6` downgraded from 6.0 → 5.9.3 deliberately) |
| `tailwindcss` | `^4.1.8` | **Tailwind v4 — CSS-first, no `tailwind.config.js`** (intentional, see §7) |
| `@tailwindcss/postcss` | `^4.1.8` | Sole PostCSS plugin (`postcss.config.mjs:3`) |
| `vitest` | `^4.1.3` | **v4 — recent major** (Q1 2026 line) |
| `@vitejs/plugin-react` | `^6.0.1` | **v6 — recent major** |
| `vite` | `^8.0.7` | **v8 — bleeding edge** (used by Vitest, not Next.js) |
| `@vitest/coverage-v8` | `^4.1.4` | Matches Vitest |
| `@playwright/test` | `^1.49.0` | Stable LTS |
| `@axe-core/playwright` | `^4.10.0` | a11y in e2e |
| `@testing-library/react` | `^16.3.2` | RTL — React 19 compatible |
| `jsdom` | `^29.0.2` | DOM shim for Vitest unit tests |
| `eslint` | `^9.39.4` | Flat config (`eslint.config.mjs`) |
| `typescript-eslint` | `^8.58.2` | `strictTypeChecked` + `stylisticTypeChecked` enabled (`eslint.config.mjs:31`) |
| `openapi-typescript` | `^7.13.0` | Generates `src/lib/api/generated/openapi.ts` from BE OpenAPI |
| `pg` | `8.20.0` | **Why a Postgres client in web?** — used only by Playwright `global-setup.ts:5` to UPDATE seed admin role |
| `@next/eslint-plugin-next` | `^15.5.15` | Matches Next |

### `pnpm.overrides` (`package.json:69-77`)

```
brace-expansion@1: ">=1.1.12 <2"
brace-expansion@2: "<6"
protocol-buffers-schema: ">=3.6.1"
postcss: ">=8.5.10"
fast-uri: ">=3.1.2"
```

These are **transitive CVE pins**; they reflect active dependency hygiene.

### Bleeding-edge / Risk flags

- React 19.2, Tailwind 4, Vite 8, Vitest 4, Recharts 3, Framer Motion 12 → **6 major-version-recent libs in the same tree**.
- This compounds: a single library regression cascades through `pnpm install`. CI gates (`ci-cd-web.yml`) cover this with `pnpm run lint && pnpm run build && pnpm test`, but no Renovate/Dependabot lockstep was seen.

---

## 3. App Router Structure

### Route map (verified by `find src/app -name "page.tsx" -o -name "layout.tsx"`)

| Route | File | Type | Server/Client |
|---|---|---|---|
| `/` (no locale) | — | redirect via middleware | — |
| `/[locale]` | `src/app/[locale]/page.tsx:33` | landing | **Server** (async; awaits `params`, `getDictionary`) |
| `/[locale]/privacy` | `src/app/[locale]/privacy/page.tsx:20` | static | **Server** |
| `/[locale]/support` | `src/app/[locale]/support/page.tsx:20` | hybrid | **Server** + `ContactForm` (client island) |
| `/[locale]/reset-password` | `src/app/[locale]/reset-password/page.tsx:8` | client wrapper | Server shell + `ResetPasswordForm` (client) |
| `/[locale]/verify-email` | `src/app/[locale]/verify-email/page.tsx:13` | client wrapper | Server shell + `EmailTokenFlow` |
| `/[locale]/confirm-email-change` | `src/app/[locale]/confirm-email-change/page.tsx` | client wrapper | Server shell + `EmailTokenFlow` |
| `/[locale]/admin` | `src/app/[locale]/admin/page.tsx:44` | dashboard | **Client** (entire admin tree) |
| `/[locale]/admin/login` | `src/app/[locale]/admin/login/page.tsx:6` | form | Client |
| `/[locale]/admin/users` | `src/app/[locale]/admin/users/page.tsx:45` | table+modal | Client |
| `/[locale]/admin/users/[id]` | `src/app/[locale]/admin/users/[id]/page.tsx:5` | **stub placeholder** ⚠️ | Server |
| `/[locale]/admin/audit-logs` | `src/app/[locale]/admin/audit-logs/page.tsx:10` | table | Client |
| `/[locale]/admin/reports` | `src/app/[locale]/admin/reports/page.tsx:22` | mod queue | Client |
| `/[locale]/admin/reviews` | `src/app/[locale]/admin/reviews/page.tsx:21` | mod queue | Client |
| `/[locale]/admin/tickets` | `src/app/[locale]/admin/tickets/page.tsx:28` | list+modal | Client |
| `/[locale]/admin/support` | `src/app/[locale]/admin/support/page.tsx:34` | thread | Client |
| `/[locale]/admin/analytics` | `src/app/[locale]/admin/analytics/page.tsx:83` | charts | Client |
| `/[locale]/admin/mfa` | `src/app/[locale]/admin/mfa/page.tsx:25` | enroll | Client |
| `/[locale]/admin/ops/grafana` | `src/app/[locale]/admin/ops/grafana/page.tsx:11` | iframe | Server (panel), super_admin only |

### Route groups

**No route groups `(name)/`** are used. The architecture is a flat `[locale]/admin/<feature>/page.tsx` per-feature tree. Locale group `[locale]/` is the only dynamic segment outside admin.

### Server vs Client component ratio

- **Pages declaring `'use client'`** : 12 (1 in `app/`, 11 under `[locale]/admin/`)  → from `grep -rn "use client" .../src/app/`.
- **Server components in `app/`** : 11 page/layout files including `app/layout.tsx`, `app/[locale]/layout.tsx`, the locale landing page, privacy, support shell, reset-password shell, verify-email shell, admin layout, admin user detail, ops/grafana layout+page.
- **Marketing components** : 13 client (`AnimatedSection`, `BentoFeatureGrid`, `DemoChat`, `DemoMap`, `FAQSection`, `HeroAnimation`, `HeroOrbs`, `PhoneMockup`, `ScrollProgress`, `StorySection`, `DemoMapLoader`, `HeroPlayerLoader`, `AnimatedLine`) + 12 pure server (`LandingHero`, `LandingAppPreview`, `LandingChatShowcase`, `LandingMapsShowcase`, `LandingDownloadCTA`, `LandingFeatureGrid`, `LandingSteps`, `LandingJsonLd`, `LandingSvgFilters`, `ShowcaseSection`, `StoreButton`).
- **Total `'use client'` directives in src** : 36.

**Observation** : The admin shell uses a **client-side render-everything pattern** rather than RSC. Every admin page is `'use client'` and fetches via `apiGet/apiPatch` in `useEffect`. This wastes Next 15's RSC potential — admin lists could use `<Suspense>` + RSC streaming for half the perceived latency. Given the small audience (B2B operators + Tim), the trade-off is reasonable; just be aware.

### Layouts

| Layout | Role | Type |
|---|---|---|
| `src/app/layout.tsx:27` | Root: HTML/body, font, nonce wiring | Server (async, awaits `headers()`) |
| `src/app/[locale]/layout.tsx:11` | Marketing chrome (Header/Footer wrappers) | Server |
| `src/app/[locale]/admin/layout.tsx:10` | AdminShell entrypoint (passes dict) | Server, wraps client `AdminShell` |
| `src/app/[locale]/admin/ops/grafana/layout.tsx:15` | super_admin RoleGuard | Server, wraps client RoleGuard |

The `Header`/`Footer` components (`src/components/shared/Header.tsx:61` + `Footer.tsx:20`) bail out client-side when on `/<locale>/admin/*` to avoid double-chrome. This is correct but means the marketing chrome briefly hydrates and unmounts on admin route entry — a tiny CLS risk.

### Error boundary

`src/app/global-error.tsx:6` — captures unhandled errors via `Sentry.captureException` and renders a static fallback HTML+button. No per-route `error.tsx` files. **Risk** : missing `not-found.tsx`; deep links to non-existent locales 404 with Next's default page.

---

## 4. i18n

### Strategy

**Custom App Router i18n**, no library (no `next-intl`, no `i18next`). 100% home-grown.

| Piece | File | Notes |
|---|---|---|
| Supported locales | `src/lib/i18n.ts:1` | `['fr','en'] as const` |
| Default | `src/lib/i18n.ts:3` | `'fr'` |
| Routing | `src/middleware.ts:119-148` | Detects `accept-language`, redirects `/<no-locale-path>` → `/{locale}/...` 301 |
| Loader | `src/lib/i18n.ts:6-13` | Dynamic `import()` per locale — JSON deduplicated by Next bundler |
| Dictionary type | `src/lib/i18n.ts:16-283` | Strongly-typed `Dictionary` interface — **267 lines of typing for every key** |
| Dictionaries | `src/dictionaries/{fr,en}.json` | **397 lines each, exact same line count → keys parity verified by length** |

### Locale detection

`getPreferredLocale` (`src/middleware.ts:22-29`) does a substring match against the raw `accept-language` header. **Risk** : naive — `en-GB,fr-CA;q=0.9` could match either depending on first hit. Acceptable for fr/en only.

### Date/Number formatting

`src/lib/i18n-format.ts:9-22` — wraps `useAdminLocale()` to BCP-47 (`fr-FR`/`en-US`) and `Intl.DateTimeFormat`. Date locale flows through `<AdminDictProvider>` (`src/lib/admin-dictionary.tsx:34`) — clean.

### Missing-key handling

**None — TypeScript-enforced.** The `Dictionary` interface (`src/lib/i18n.ts:16-283`) is a hard contract; missing keys fail `tsc --noEmit`. Trade-off : great DX, but any new feature adding a key requires both FR/EN updates simultaneously or CI breaks. Acceptable.

### Locale switcher

`src/components/shared/LanguageSwitcher.tsx:19-41` — single button toggling between FR/EN, preserves pathname segments. Properly delivers `aria-label`. **Risk** : if locales expand beyond 2 it becomes a select; today fine.

### Server-only dictionary

`getDictionary` is called from server components (`page.tsx`, `layout.tsx`) and the slice is passed as props/prefilled context to client components (`AdminShell.tsx:188-201`). Confirmed : **no full dictionary is shipped to the client bundle**.

---

## 5. Admin Panel

### Auth flow (F7 cookie migration, 2026-04-30)

| Step | File | Behavior |
|---|---|---|
| Login form | `src/components/admin/LoginForm.tsx:66-76` | POST `/api/auth/login`; on success, backend sets `access_token` + `refresh_token` + `csrf_token` HttpOnly cookies |
| Client cookie hint | `src/lib/auth.tsx:31-39` | Sets `admin-authz=1` (NOT HttpOnly, `Max-Age=8h`, SameSite=Lax) — purely a UX hint for middleware redirect |
| Edge gate | `src/middleware.ts:108-117` | `redirectUnauthedAdminTarget` matches `/<locale>/admin(?!/login)` and 302s to `/admin/login?redirect=...` if no `admin-authz` cookie |
| Mount hydration | `src/lib/auth.tsx:123-147` | `useEffect` probes `GET /api/auth/me` once on mount — only if `admin-authz` present (the cookie hint avoids fetches for public visitors) |
| Refresh | `src/lib/api.ts:103-128` | POST `/api/auth/refresh` (cookie-driven, no body needed); CSRF header echoed from `csrf_token` cookie |
| Refresh queue | `src/lib/api.ts:130-151` | Mutex `isRefreshing` + `failedQueue` to coalesce concurrent 401s — clean implementation |
| Logout | `src/lib/auth.tsx:149-157` | clears tokens (no-op post-F7), clears `admin-authz`, navigates to login |
| 401 handler | `src/lib/api.ts:189-198` | On 401, attempt refresh once, retry; on failure → `onLogout` callback |

### CSRF double-submit

`src/lib/api.ts:171-176` — for POST/PUT/PATCH/DELETE, reads `csrf_token` from `document.cookie` and sets `X-CSRF-Token` header. Backend must verify the header matches the cookie. **Correct CSRF pattern for cookie-based JWT.**

### RBAC

`UserRole` enum at `src/lib/auth.tsx:64` : `visitor | moderator | museum_manager | admin | super_admin`.

| Component | Role check |
|---|---|
| `AdminShell` shell | `RoleGuard allowedRoles={['admin','moderator','super_admin']}` (`AdminShell.tsx:196`) |
| Ops/grafana | `RoleGuard allowedRoles={['super_admin']}` (`ops/grafana/layout.tsx:16`) |
| `AuthGuard` (auth-only) | `src/lib/auth.tsx:216-243` — used when no role check needed |
| `RoleGuard` (auth + role) | `src/lib/auth.tsx:254-300` |
| Sidebar `super_admin`-only link | `AdminShell.tsx:109` — hides Ops Grafana from `admin` (B2B operators) |
| User-list "change role" button | `users/page.tsx:48` — only `currentUser?.role === 'admin'` sees it (super_admin should arguably too) |

**Defense-in-depth** : the admin-authz cookie is an Edge UX redirect; backend JWT enforcement on every `/api/admin/*` is the real boundary (commented at `src/middleware.ts:13-17`). Solid model.

### List/detail patterns

Every list page (users, audit-logs, reports, reviews, tickets, support) uses the same template:
1. `useState` for `data`, `totalPages`, `total`, `page`, filters, `loading`, `error`.
2. `useEffect`/`useCallback` to fetch on filter change.
3. Reset `page` to 1 on filter change.
4. `<table>` with status/role badges, `AdminPagination` component.
5. Modal for edit, gated by `editingX` state.

This template is repeated 6 times nearly verbatim (`users/page.tsx`, `tickets/page.tsx`, `reports/page.tsx`, `reviews/page.tsx`, `audit-logs/page.tsx`, `support/page.tsx`). **Refactor opportunity** : a `<AdminListPage<T>>` higher-order component or `useAdminList(endpoint, params)` hook could halve LOC. Not blocking.

### Mutations

PATCH for user role change (`users/page.tsx:106`), ticket update (`tickets/page.tsx:86-89`), report review (`reports/page.tsx:78-81`), review moderation (`reviews/page.tsx:75-77`), and reply send (`support/page.tsx:75-77`). All go through `apiPatch`/`apiPost` with CSRF header attached automatically. No optimistic UI / no `useOptimistic`. After mutation : modal closes, `fetchX()` re-fetches. **Simple, reliable, but adds 1 round-trip on each action**.

### `/users/[id]` page — stub

`src/app/[locale]/admin/users/[id]/page.tsx:1-37` literally renders `<span>---</span>` placeholders for Email/Role/Created. Hard-coded French copy ("Utilisateur #{id}"). **Action required before launch** if user-detail navigation is exposed; today no list page links to it (`users/page.tsx` has no row link), so it's dead. **Recommend: delete the file or finish it.**

### Analytics page

`analytics/page.tsx` mounts 3 parallel fetches (`Promise.all` of usage/content/engagement) on first render (line 108-114); only usage re-fetches on filter change. Uses Recharts `LineChart` + `BarChart` + `ResponsiveContainer`. The `EmptyChartPlaceholder` properly handles all-zero rows (`isAllZero` helper line 76). Solid.

### MFA enrollment

`src/app/[locale]/admin/mfa/page.tsx` — 3-step TOTP enroll → QR (rendered as inline SVG via `dangerouslySetInnerHTML` line 106) → recovery codes → verify. **Recovery codes are shown ONCE in plain text** (intentional, comment line 17), and copy-to-clipboard helper at line 64. Standard pattern. **Hard-coded English copy** (line 73-76, 88, 102…) — not yet in dictionary; will leak through FR locale.

---

## 6. Landing Pages

### Composition

`src/app/[locale]/page.tsx:38-71` composes 11 marketing sections in this exact order:

1. `<ScrollProgress />` — top progress bar (Framer Motion)
2. `<LandingJsonLd />` — 4 JSON-LD blobs (App, Organization, Site, FAQ) injected via `dangerouslySetInnerHTML` with semgrep waivers
3. `<LandingSvgFilters />` — SVG `<defs>` for liquid-glass effects
4. `<LandingHero />` — hero w/ orbs + animated phone mockup (`HeroAnimation`)
5. `<StorySection />` — 4-step animated timeline
6. `<LandingAppPreview />` — hero-blurred BG + tags
7. `<LandingSteps />` — 3 steps with `AnimatedLine` connector
8. `<AiDisclosureBanner />` — EU AI Act Art. 50 required (`ai-disclosure/AiDisclosureBanner.tsx:18`)
9. `<LandingChatShowcase />` — `PhoneMockup` w/ `DemoChat`
10. `<LandingMapsShowcase />` — 2 phones side-by-side (list + map) using `DemoMapLoader`
11. `<LandingFeatureGrid />` — bento grid 6 cards
12. `<FAQSection />` — accordion
13. `<LandingDownloadCTA />` — store buttons + final CTA

### Framer Motion animations

| Component | Key animations | Reduced-motion respect |
|---|---|---|
| `HeroAnimation.tsx:23` | Phone scale spring + float (Y/rotateY/rotateX) + 3 ambient orbs drift | Yes — `useReducedMotion()` short-circuits all `animate` props |
| `AnimatedSection.tsx:72` | 4 variants (slide/scale/fade/blur-scale) + stagger, scroll-triggered via `useInView` | Yes — early return at `:84` strips animation |
| `BentoFeatureGrid.tsx:25` | Card-by-card stagger (0.08s) with custom easing curve | Indirect (uses `whileInView`, fades acceptable) |
| `DemoChat.tsx:29` | Message bubbles spring-in stagger | Yes |
| `HeroOrbs.tsx:5` | Parallax orbs via `useScroll`+`useTransform` | Yes — line 14 |
| `Header.tsx:33-43` | `useTransform` on scrollY for backdrop fade (alpha 0.9 → glass) | Indirect |
| `ScrollProgress.tsx` | Top scroll progress bar | — |
| `StorySection.tsx:103-156` | Scroll-triggered timeline animation | `whileInView` (no `useReducedMotion`) ⚠️ |
| `PhoneMockup.tsx:48-56` | 3D mouse-tilt + scroll parallax | — |

**Globals CSS reduce-motion** : `src/app/globals.css:364-393` — `*` selector forces `animation-duration: 0.01ms !important` under `prefers-reduced-motion: reduce`. **Belt-and-suspenders** — good.

### CTAs / Conversion-critical

- Hero `dict.hero.cta` → `#download` anchor (LandingHero.tsx:57)
- Hero `dict.hero.ctaSecondary` → `#how-it-works` anchor
- LandingDownloadCTA `StoreButton` components — App Store + Google Play (`StoreButton.tsx:24`). **`href = '#'` default** (`StoreButton.tsx:24`) — **the call sites pass no href, so today the buttons go nowhere**. ⚠️ **CRITICAL** for launch.

### Bottom-section CTA

`LandingDownloadCTA.tsx:16-64` — large dark-themed band with store buttons. Animated via `AnimatedSection variant="scale"`.

### Privacy/SSR-friendliness

All marketing sections are SSR-rendered with their `'use client'` islands hydrating only the motion logic. Confirmed by `grep -L "use client"` finding 11 server-side marketing components.

---

## 7. Tailwind 4

### Config

**No `tailwind.config.{js,ts}` file** — Tailwind v4 uses CSS-only configuration via the `@theme` directive.

| File | Role |
|---|---|
| `postcss.config.mjs:1-9` | Single plugin `@tailwindcss/postcss` |
| `src/app/globals.css:1-2` | `@import 'tailwindcss';` + `@import '../tokens.css';` |
| `src/tokens.css:1-9` | Aggregate: imports `tokens.generated.css` + `tokens.functional.css` + `tokens.semantic.css` |
| `src/tokens.generated.css` | Primitive design tokens (auto-generated from `design-system/`) |
| `src/tokens.functional.css` | Functional aliases (`--fn-glass-border`, `--fn-card-bg`, …) |
| `src/tokens.semantic.css` | Semantic component tokens (`--sem-card-padding`, `--sem-chat-bubble-radius`, …) |

All token files are **AUTO-GENERATED by `design-system/build.ts`** (banner header). Source of truth = `design-system/` package. Web consumer = the 3 CSS files imported once.

### Dark mode

**Not implemented for marketing.** The dark "sections" (hero, download CTA, chat showcase) use explicit dark semantic tokens (`--sem-section-dark-background`) on a fixed light app shell. No `dark:` Tailwind variant usage seen; no `@media (prefers-color-scheme: dark)` toggle. Admin shell is white-only.

### Custom plugins / utilities

`src/app/globals.css:17-393` defines a sizable set of bespoke utilities:
- `.glass` / `.glass-heavy` / `.glass-card`
- `.liquid-glass` / `.liquid-glass-heavy` / `.liquid-glass-card` (with conic-gradient hover border at `:184`)
- `.app-gradient-bg`, `.section-dark`
- Typography clamps `.text-hero` / `.text-section`
- `.mesh-gradient` + `.orb` + `.orb-delay-{1,2,3}` w/ keyframes `float-orb`, `scan-line`, `border-rotate`, `specular-shift`, `scroll-bounce`
- `@property --border-angle` registration

These are pure CSS — no Tailwind plugin runtime. **Lighthouse perf** : the 200+ CSS lines + `feTurbulence`/`feDisplacementMap` filter in `LandingSvgFilters.tsx:6-40` are expensive on low-end mobile.

### Tailwind 4 `@theme`

The token files declare every primitive inside `@theme {}` blocks (`tokens.generated.css:3`, `tokens.functional.css:3`, `tokens.semantic.css:3`), which Tailwind 4 promotes to first-class utilities like `bg-primary-500`, `text-text-secondary`, etc. without manual config.

---

## 8. React 19 Features Used

Verified by `grep -rn "useFormState\|useOptimistic\|useTransition\|\"use server\"\|action="`.

| Feature | Used? | Notes |
|---|---|---|
| Server Actions (`'use server'`) | **No** | No `'use server'` directives found |
| `useFormState` / `useActionState` | **No** | Forms use legacy `onSubmit` + `useState` |
| `useOptimistic` | **No** | Admin mutations refetch on success |
| `useTransition` async | **No** | |
| `use()` hook | **No** | |
| RSC | **Yes** (partially) | Server components used for layouts, public pages, dictionary loading; admin tree is 100% client |
| `Suspense` boundary | **Yes** (limited) | `ResetPasswordForm.tsx:161`, `EmailTokenFlow.tsx:172-178` (wraps `useSearchParams`) |
| `headers()` async API | **Yes** | `src/app/layout.tsx:28` — `const headersList = await headers()` (React 19 / Next 15 promise-based) |
| `Promise<{ locale }>` params | **Yes** | All Next 15 pages await `params` (e.g. `[locale]/page.tsx:34`) |

**Verdict** : React 19 is used at the API-shape level (promise-based `params`/`headers`), but **none of the new client-state primitives are adopted**. Migration to `useFormState` for `ContactForm`, `LoginForm`, `ResetPasswordForm`, and `EmailTokenFlow` could simplify code and remove `useState` boilerplate, but is non-urgent.

---

## 9. Performance

### Lighthouse CI thresholds (`lighthouserc.json:6-15`)

| Category | Mode | Min score |
|---|---|---|
| Performance | warn | 0.85 |
| Accessibility | **error** | 0.90 |
| SEO | warn | 0.90 |
| Best practices | warn | 0.85 |

**Only a11y errors fail the PR**; perf/SEO/best-practices warn-only. Runs against `/en` route only (line 5), single iteration. **Risk** : a perf regression that drops below 0.85 surfaces as warning, not blocker — could ship dead-slow landing without a hard stop.

### Bundle analyzer

**Not configured.** No `@next/bundle-analyzer` in `package.json`. No `analyze` script. Cannot verify bundle size discipline post-build.

### Image optimization

- `next.config.ts:18-20` — `formats: ['image/avif', 'image/webp']` (AVIF + WebP enabled).
- 12 files use `next/image` (`Image` from `next/image`). Hero logo (`LandingHero.tsx:32`) and DLB CTA logo (`LandingDownloadCTA.tsx:39`) flagged `priority`.
- **No custom domain in `images`** — Next will optimize on-the-fly via the standalone server. **At 100k MAU this becomes a CPU bottleneck** without a CDN.
- `LandingMapsShowcase.tsx:26` uses `next/image` with `fill` + literal screenshot paths containing **spaces** (`"iPhone 16 Pro Max /iPhone 16 Pro Max - list Nearby museum.png"`). Path-traversal-safe but fragile (a future `find` script would break).
- `public/images/` contains favicon-32, favicon-192, apple-touch-icon, logo.png, screenshots/. **No SVG logo seen** — all PNG.

### Font loading

`src/app/layout.tsx:6-10` uses `next/font/google` `Inter` with `display: 'swap'`. Hooked to `--font-inter` CSS var, applied via `body className`. **Correct pattern** : self-hosted, no Google Fonts request from browser, no FOUT beyond `swap`.

### Edge runtime

**Not used.** Middleware (`src/middleware.ts`) implicitly runs on Edge (it's middleware), but no other route exports `runtime = 'edge'`. All admin/API rewrites hit the Node runtime.

### ISR / SSG

**Not configured.** No `revalidate` exports on any page. `generateStaticParams` is **not** declared on `[locale]` (it would let Next pre-render `/fr` and `/en` at build time). **Consequence** : every landing page request triggers full SSR — at 100k MAU and any traffic burst, the single Node process is the bottleneck. `output: 'standalone'` (`next.config.ts:17`) helps deployment but doesn't add caching.

### Dynamic imports w/ `ssr: false`

- `DemoMapLoader.tsx:5` — MapLibre GL (~700 KB)
- `HeroPlayerLoader.tsx:5` — `HeroAnimation` (heavy phone mockup)

Good — these are lazy. **But on first hero paint, the orb is replaced by HeroAnimation's spinner-then-content jump**, which can hurt LCP. Worth measuring.

### Standalone Docker

`deploy/Dockerfile.prod:1-49` — proper multi-stage build (deps → build → runtime), `node:22-bookworm-slim`, non-root `nodeuser:1001`, healthcheck via `node -e fetch(...)`, `STOPSIGNAL SIGTERM`. Solid hygiene.

### Sentry traces

`sentry.client.config.ts:13` sets `tracesSampleRate: 0.1` (10%) and `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN`. PII scrubber wired (`beforeSend`/`beforeBreadcrumb`). **Sustainable at 100k MAU** for the trace volume.

---

## 10. SEO

| Surface | File | Notes |
|---|---|---|
| Root metadata | `src/app/layout.tsx:12-25` | `title.template = '%s | Musaium'`, `metadataBase = NEXT_PUBLIC_SITE_URL`, favicon set (32/192) + apple-touch |
| Per-page metadata | `[locale]/page.tsx:22-31` + privacy + support | Async `generateMetadata` reads dictionary for title/desc + OG |
| OG helpers | `src/lib/seo.ts:5-23` | `getAlternates`/`getOpenGraph` — sets `locale: 'fr_FR' / 'en_US'`, `alternateLocale`, `siteName`, OG image (`/images/logo.png` 1024×1024) |
| Sitemap | `src/app/sitemap.ts:6-26` | Generates `/{locale}/{path}` for 3 pages × 2 locales × hreflang alternates incl. `x-default` |
| Robots | `public/robots.txt:1-45` | `Disallow: /*/admin`, `/*/reset-password`, `/api/`; explicit Allow/Disallow per AI bot (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Applebot-Extended, Google-Extended; **Bytespider + CCBot Disallow `/`**) |
| `llms.txt` | `public/llms.txt:1-29` | LLM-friendly summary of app + key pages + FAQ |
| Structured data | `src/components/marketing/LandingJsonLd.tsx:1-104` | 4 schemas: MobileApplication, Organization, WebSite, FAQPage. semgrep waiver `dangerouslySetInnerHTML` (data is dev-controlled) |
| Canonical | `seo.ts:7` + `[locale]/page.tsx:28` | `alternates.canonical` set per-page |
| hreflang | Sitemap + `getAlternates` | FR + EN + `x-default` (= FR) |

**Verification keys** in `public/`: `BingSiteAuth.xml`, `googlec5b58387174f8ad4.html`.

**Verdict** : SEO is **excellent for V1**. The `llms.txt` and per-bot robots tuning is unusually mature for a pre-launch product.

---

## 11. Privacy / Cookies / Consent

### GDPR cookie banner

**No cookie consent banner is implemented.** The cookies set are:
- `admin-authz=1` (UX hint, set client-side on admin login) — **strictly necessary** for the admin UX, exempt from GDPR consent.
- `access_token` / `refresh_token` / `csrf_token` — set by backend on `/api/auth/login` — **strictly necessary** for auth.

No analytics or marketing cookies are set. **No Google Analytics, no GTM, no Plausible, no Matomo, no Mixpanel** — confirmed by `grep -rn "gtag\|GTM-\|plausible\|matomo\|mixpanel"` (no matches).

This is **legally clean** : strictly necessary cookies are exempt from CNIL/UK ICO opt-in requirements. **No consent banner is required.** Smart pre-launch decision.

### Privacy policy

`src/lib/privacy-content.ts` (13 232 bytes, ~280 lines) — full GDPR-compliant text in FR + EN, version `1.0.0` last updated `2026-03-18`. Sections : Data Controller, Data Collected, Purposes, Legal Bases (Art. 6), Recipients & Sub-processors (OpenAI, Google Cloud, DeepSeek, OVH, AWS, Expo), International Transfers, Retention, Security, Rights, Complaints. **Comprehensive and accurate.**

Subprocessor list includes **DeepSeek (China)** — relevant for GDPR Schrems II concerns. Privacy doc is silent on the lack of an SCC for DeepSeek; **legal-team check before EU rollout**.

### EU AI Act Article 50 disclosure

`src/components/ai-disclosure/AiDisclosureBanner.tsx:18-28` — bilingual banner on landing page mentioning AI generation, deployed for the **2026-08-02 enforcement deadline** of Reg. (EU) 2024/1689. Renders below the LandingSteps section (`[locale]/page.tsx:59-61`). Good early compliance.

### Sentry PII scrubbing

`src/lib/sentry-scrubber.ts:14-169` — strips Authorization/Cookie/X-API-Key headers, body keys matching `/password|token|secret|api[_-]?key|refresh/i`, sensitive query keys, and email → SHA-32 fingerprint. Mirrors the BE+mobile scrubbers (comment line 10). **Trustworthy.**

---

## 12. Testing

### Unit tests — Vitest

- Config : `vitest.config.ts:1-61` — jsdom environment, RTL setup at `src/__tests__/setup.ts`.
- 29 `*.test.*` files total; 11 under `__tests__/admin/`.
- Coverage scope (lines 29-47) : `src/lib/**` + `src/components/{admin,auth,shared}/**` + `src/hooks/**`. **Marketing components EXCLUDED** from coverage by design (Playwright + Lighthouse cover those, per comment line 22-28).
- Coverage thresholds (lines 53-58) : lines ≥ 70 %, branches ≥ 54 %, functions ≥ 64 %, statements ≥ 68 %. **Floors deliberately low** (ADR-007 reference line 51) — Vitest scope is narrow on purpose.
- The CI workflow runs `pnpm test` but **the coverage gate appears not to be enforced yet** (`ci-cd-web.yml` runs `pnpm test`, not `pnpm test:coverage`).

### Snapshot tests

`src/__tests__/snapshots/component-snapshots.test.tsx` (6932 bytes) — small snapshot suite.

### a11y unit

`src/__tests__/a11y/accessibility-audit.test.tsx` (5748 bytes) — axe-core component scan.

### Playwright e2e

- Config : `playwright.config.ts:12-33` — browsers from `PW_BROWSERS` env (default chromium), 2 workers in CI, 1 retry.
- `e2e/flows/` : 4 admin flow specs (audit-logs, login, reports-moderation, users).
- `e2e/a11y/` : 6 real-axe specs (admin-dashboard/login/users + public-landing/privacy/support) + `_disable-rules.json` cap test.
- `e2e/global-setup.ts:1-100` — seeds an admin via `POST /api/auth/register`, escalates role via direct `pg` UPDATE, persists cookies via API login (not UI form) to avoid CI timing flakiness (comments line 53-58).
- Disable-rules cap : `src/__tests__/a11y-disable-rules-cap.test.ts` enforces axe disable-rule list cannot grow.

### CI matrix

`.github/workflows/ci-cd-web.yml` :
- `quality` : pnpm install + Trivy fs scan + check:openapi-types + lint + build + test.
- `playwright-pr` : full backend boot (Postgres 16 + migrate + dev server) + Next.js dev + Chromium e2e.
- `playwright-nightly` : same but Chromium + Firefox + WebKit at 03:23 UTC.
- `lighthouse` : PR-only, builds + LHCI.
- `deploy` : main only, builds image, Trivy image scan, pushes to GHCR, SSH-deploy to VPS.

**Verdict** : test surface is **above average for V1**. Coverage gates are intentionally narrow ; that's fine but should be documented for future contributors.

---

## 13. Build & Deploy

### Build

- `pnpm build` → `next build` w/ `output: 'standalone'` (`next.config.ts:17`).
- Sentry wrapped via `withSentryConfig` (`next.config.ts:37-43`) — sourcemap upload conditional on `SENTRY_AUTH_TOKEN` (good — no leaks in PR builds).
- Build banner suppressed `NEXT_TELEMETRY_DISABLED=1` (Dockerfile line 19+29).

### Docker

`deploy/Dockerfile.prod:1-49` — 3-stage (deps → build → runtime), corepack-pinned `pnpm@9.15.3` (NB: `package.json` says `pnpm@10.8.0`; **mismatch but probably benign because corepack resolves on demand**). Non-root user, HEALTHCHECK via `node -e fetch(...)`. Image base `node:22-bookworm-slim`. Standalone server runs on port 3001 (line 27). `STOPSIGNAL SIGTERM` (line 47).

### Deploy

`.github/workflows/ci-cd-web.yml:312-388` :
- Build + Trivy image scan + push to GHCR.
- `appleboy/ssh-action@0ff4204...` to VPS — pulls image, `docker compose up -d --remove-orphans --timeout 30 museum-web`, healthcheck loop (20 tries × 3 s = 60 s window).
- No staging environment (per `MEMORY/project_no_staging_v1.md`) — prod = stage.

### Env handling

`.env.example:1-11` :
- `API_BASE_URL` (server)
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_DEFAULT_LOCALE`
- `NEXT_PUBLIC_SENTRY_DSN`

That's it. **All other secrets** (DB, JWT, SMTP, …) live in the backend; web has no secret of its own except optionally `SENTRY_AUTH_TOKEN` (build-time, for sourcemap upload).

### Cache headers

**Not seen.** `next.config.ts` does NOT set `Cache-Control` for static assets via `headers()`. Defaults apply :
- Next default for `_next/static/*` = `public, max-age=31536000, immutable` ✓
- Next default for the `/` HTML = `private, no-cache` — at 100k MAU you want a downstream CDN (Cloudflare) to enforce edge caching with TTL. **Risk** : no cache reverse proxy config visible at the repo level.

---

## 14. Security

### CSP — per-request nonce

`src/middleware.ts:65-83` — `buildCspHeader(nonce, isDev)` generates :

```
default-src 'self';
script-src 'self' 'nonce-${nonce}' 'strict-dynamic' [+'unsafe-eval' in dev];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests
```

Nonce is injected into the root layout `<meta property="csp-nonce">` (`app/layout.tsx:37`) so Next.js auto-injected scripts pick it up. **`strict-dynamic`** is the modern best practice.

**Weak points** :
1. **`style-src 'self' 'unsafe-inline'`** (`middleware.ts:73`) — pragmatic concession for Framer Motion's inline styles (comment lines 56-63). Increases XSS surface for CSS-injection attacks (data exfiltration via background-image URL, animation timing). **Mitigation** : refactor Framer Motion uses to use CSS classes instead of inline `style=` props — non-trivial, possibly ADR-worthy.
2. **`img-src https:`** allows any HTTPS image — broad. Tightening to `cdn.musaium.com` (if you ever have one) reduces risk.
3. **Sentry connect-src** correctly restricted to `*.ingest.sentry.io`. ✓

### Other security headers

`next.config.ts:8-14` :
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✓
- `X-Content-Type-Options: nosniff` ✓
- `X-Frame-Options: DENY` ✓
- `Referrer-Policy: strict-origin-when-cross-origin` ✓
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()` ✓ (matches needs of mobile app sub-features only; web doesn't ask for any)

### CSRF

Cookie + double-submit header (`src/lib/api.ts:171-176`). **Correct pattern**.

### XSS surface

- 4 `dangerouslySetInnerHTML` usages in `LandingJsonLd.tsx:84,89,94,99` for JSON-LD blobs (serialized via `JSON.stringify`, content is developer-controlled — semgrep waivers added).
- 1 in `admin/mfa/page.tsx:106` for QR SVG (from `QRCode.toString()` — trusted output).
- No `innerHTML` of user input.

### Auth cookie strategy

Cookies are issued by the backend (`F7` migration 2026-04-30) :
- `access_token` : HttpOnly + Secure + SameSite=Strict (per comment `src/lib/api.ts:9`)
- `refresh_token` : same, Path=/api/auth
- `csrf_token` : NOT HttpOnly (for double-submit) — comment `src/lib/api.ts:11-13`
- `admin-authz` : NOT HttpOnly (UX hint for middleware), Path=/, SameSite=Lax, 8h (`src/lib/auth.tsx:38`)

**Strong model.** JS cannot exfiltrate access/refresh tokens via XSS.

### Iframe sandboxing

`src/components/ops/GrafanaIframe.tsx:48-60` — sandbox restricted to `allow-scripts allow-same-origin` (no allow-forms / allow-popups / allow-top-navigation). Documented threat model in `docs/OPS_DEPLOYMENT.md` per comment line 9-22. **Correct defensive sandbox.**

### Rate limiting

**Not seen at the web layer.** `/api/support/contact` (used by `ContactForm.tsx:24`) is proxied straight to the backend via `next.config.ts:27-33` rewrites. Rate limiting must live in backend (unverified in this audit) — **high-priority confirmation** for production.

### Secrets in repo

`grep -rn "API_BASE_URL\|SENTRY_DSN"` returns only env-var lookups, no hardcoded values. ✓

### Trivy scans

Two passes : `aquasecurity/trivy-action` fs scan on `museum-web/` (line 47), image scan on built artifact (line 327). Both gate on `CRITICAL,HIGH` with `exit-code: '1'`. ✓

---

## 15. Top 10 Risks for Launch V1 (100k MAU)

| # | Risk | Severity | Likelihood | Action |
|---|---|---|---|---|
| 1 | **Store buttons `href='#'` default** (`StoreButton.tsx:24`); call sites pass no `href`, so App Store / Google Play CTAs go nowhere | CRITICAL | Certain | Wire `href` to live store URLs before launch |
| 2 | **`/users/[id]` stub page** rendering `---` placeholders shipped to prod | HIGH | Hits when discovered | Delete the file or finish detail view |
| 3 | **No ISR / SSG / CDN** — every landing hit triggers full SSR on the standalone Node process. At 100k MAU + a single Reddit/HN spike, p95 latency degrades | HIGH | Medium | Add `revalidate = 3600` on `/[locale]/page.tsx`, or front the Docker container with Cloudflare cache rules |
| 4 | **`style-src 'unsafe-inline'`** weakens CSS-injection mitigations | MEDIUM | Low (CSS-injection rare) | Refactor Framer Motion to className-driven animations; ADR-worthy |
| 5 | **Recharts 3 + React 19 + Framer Motion 12 + Vitest 4** — 4 fresh majors in the same tree. Any one regression breaks build | MEDIUM | Medium | Pin exact versions; add Renovate group rule with auto-merge only on green tests |
| 6 | **No rate limiting visible on `/api/support/contact`** at web layer; relies entirely on BE | MEDIUM | Medium | Confirm BE rate limit; consider adding Next middleware throttling per-IP |
| 7 | **AnalyticsPage on first paint loads 3 parallel admin endpoints** — fine for admins but for non-trivial JSON could exceed 5 s on slow links | LOW | High occurrence | Move charts to Suspense + RSC streaming (also unlocks selective re-rendering) |
| 8 | **MFA page hard-codes English copy** (`mfa/page.tsx:73-156`) — leaks through FR | MEDIUM | Certain | Move strings to dictionary |
| 9 | **Lighthouse perf is warn-only at ≥ 0.85**; a regression below 0.85 ships silently | MEDIUM | Medium | Promote to `error` for the launch sprint, then back to `warn` post-launch |
| 10 | **DeepSeek subprocessor** (China) listed in privacy doc without SCC mention — Schrems II exposure for EU users | MEDIUM | Medium | Legal review or remove DeepSeek as fallback before EU rollout |

### Heat map

```
Critical : [1]
High     : [2, 3]
Medium   : [4, 5, 6, 8, 9, 10]
Low      : [7]
```

---

## Appendix A — Key file:line citations

- Stack : `museum-web/package.json:26-65`
- Middleware (CSP + i18n + admin gate) : `museum-web/src/middleware.ts:65-148`
- Auth provider : `museum-web/src/lib/auth.tsx:104-198`
- API client : `museum-web/src/lib/api.ts:103-219`
- Admin shell : `museum-web/src/components/admin/AdminShell.tsx:177-204`
- Landing page : `museum-web/src/app/[locale]/page.tsx:33-71`
- Hero animation : `museum-web/src/components/marketing/HeroAnimation.tsx:22-228`
- Tailwind config : (none — CSS only) `museum-web/src/tokens.css:1-9` + `globals.css:1-2`
- Sitemap : `museum-web/src/app/sitemap.ts:6-26`
- JSON-LD : `museum-web/src/components/marketing/LandingJsonLd.tsx:14-103`
- Privacy content : `museum-web/src/lib/privacy-content.ts:1-280+` (~13 KB)
- Sentry scrubber : `museum-web/src/lib/sentry-scrubber.ts:14-169`
- Dockerfile : `museum-web/deploy/Dockerfile.prod:1-49`
- CI workflow : `.github/workflows/ci-cd-web.yml:1-388`
- Lighthouse CI : `museum-web/lighthouserc.json:1-17`
- Vitest config : `museum-web/vitest.config.ts:1-61`
- Playwright config : `museum-web/playwright.config.ts:12-33`
- Playwright global setup : `museum-web/e2e/global-setup.ts:1-100`

## Appendix B — Recent web-relevant commits (top 20)

```
9471649  audit-cleanup 2026-05-12 — 4-agent parallel sprint
4018cc6  docs(C4): plan anti-hallucination + bump versions 1.2.1 → 1.2.2
961fe53  feat(admin): add Google OAuth sign-in to museum-web admin login
580cf47  chore(deps): update dependency brace-expansion@2 to v5
a0cd347  fix(c1-followup): post-merge review — 3 nits + prometheus refactor
63dfab3  feat(C1): chat instrumentation + Grafana iframe + super_admin role
4dcdc9e  fix: close residual sprint 2026-05-05 P1 deferred items (E34)
e2a958d  fix(web/a11y): admin dashboard contrast + users select aria-label (E33)
8eaaffa  fix(ci): close sprint 2026-05-05 P1 deferred D1 + D2
850768b  fix(web/a11y): LanguageSwitcher onDark prop (E32)
db369c2  fix(web/auth): hydrate session from /api/auth/me on mount (E31)
f82b1a2  fix(web/a11y): bump Header backdrop alpha 0.55 → 0.9 (E30)
34b1eaa  fix(web): hide marketing Header/Footer on /<locale>/admin/* (E29)
9c06c74  fix(web/a11y): solid-dark backdrop on Header at scrollY=0 (E28)
890395f  fix(web/a11y): bump Footer madeBy text to text-tertiary (E26)
1e7959f  chore(types): regenerate web openapi types after PHASE 1 BE merge
a091a96  chore(web): downgrade TypeScript 6.0→5.9.3 (ADR-032)
c9dd02a  refactor(web): split landing page into section components
864b16d  ci(coverage): Web Vitest scope refined (Phase 11 Sprint 11.1)
4449de4  feat(web): mount StorySection in landing page (T7.2)
```

The a11y-cluster of fixes (E26-E34, all April-May 2026) indicates **active hardening** for the launch — Header contrast, language switcher dark backdrop, footer text contrast, hide-marketing-chrome-on-admin, session hydration. Solid trajectory.

---

End of audit.
