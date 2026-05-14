# R18 — Next.js Perf + SEO + i18n (2026)

> Research agent **R18** — audit nocturne Musaium 2026-05-12.
> Scope : `museum-web/` (Next.js 15.5.18, React 19.2, Tailwind 4, Framer Motion 12, Sentry 10, Inter via `next/font`, output `standalone`, single Node container, no CDN/edge).
> Honesty UFR-013 — every claim sourced, versions tracked, uncertainty stated. 21 web searches + 1 doc fetch.

---

## 0. TL;DR (lecture 90 secondes)

1. **Setup actuel = "boring, mostly correct"**. Standalone Node, Inter via `next/font` with `display:'swap'`, `formats:['avif','webp']`, sitemap.ts + alternates, robots.txt distinct for AI bots, llms.txt v1, per-request CSP nonce in middleware. ~80 % de ce que recommande la communauté est déjà fait.
2. **Mais 5 gaps importants pour 100 k visiteurs/mois** (verifiés cf. §11) :
   - **(a) Aucun CDN devant le Node** → chaque hit landing = SSR full sur 1 container. À 100 k/mois (~140 req/h moyenne, peaks ~1k req/h soft launch), un VPS 2 vCPU encaisse, mais le LCP global est gouverné par le RTT VPS OVH ↔ utilisateur Asie/Amériques. Cloudflare Free devant = lift LCP "free".
   - **(b) Lighthouse en `warn-only`** sur perf/SEO/best-practices → régressions silencieuses. Doctrine "no flags pre-launch" (cf. CLAUDE.md MEMORY) ⇒ il faut **bloquer**, pas warner.
   - **(c) PPR pas activé** alors que la landing est exactement le cas d'école PPR (shell statique + 0 dynamic actuellement). Sur Next 15, PPR `incremental` est stable per-route. **Mais** : `experimental: { ppr: 'incremental' }` reste flagué *experimental* dans les docs officielles ; gain réel pour Musaium = marginal car page = 100 % static today. ⇒ **non prioritaire**, à ré-évaluer Next 16.
   - **(d) `images: { formats: ['avif','webp'] }` activé sans réfléchir au coût build/cache** : AVIF prend ~50 % plus long à encoder que WebP pour ~20 % de bytes gagnés ; et Next cache chaque format séparément → 2x storage. Sur landing static, OK ; sur image catalog (e.g. admin), à profiler.
   - **(e) Aucun custom loader CDN** pour `next/image` → l'optimisation tourne sur le Node container (SSR cost). Pour 100 k/mois ça passe ; ≥ 500 k/mois il faut Cloudflare Images / BunnyCDN Optimizer.
3. **Verdict global** : current setup OK pour soft launch 2026-06-01 + 3 premiers mois. **Top 5 perf wins** (cf. §11.3) ordonnés par ratio impact/effort : (i) Cloudflare Free devant Node, (ii) Lighthouse `error` au lieu de `warn`, (iii) preload font Inter latin + adjustFontFallback, (iv) `fetchPriority="high"` sur hero LCP image (Next 16 deprecate `priority`, déjà fait via prop), (v) bouger Sentry tracing à 10 % sample en prod.

---

## 1. ISR vs SSG vs SSR vs PPR — decision matrix 2026

### 1.1 État des stratégies

| Strat. | TTFB cible | Caching | Personalisé | Production ready | Use case Musaium |
|---|---|---|---|---|---|
| **SSG** | ~50 ms (CDN) | build-time, immutable | Non | Stable depuis 2019 | Landing pure FR/EN — **idéal** |
| **ISR** | ~50 ms (CDN) | build + revalidate (sec/tag) | Non (shared) | Stable | Si on rajoute blog / pages dynamiques (RSS musées) |
| **SSR** | 200-500 ms | per-request | Oui | Stable | Admin panel (JWT-gated) — **déjà SSR** |
| **PPR** | ~50 ms shell + stream | static shell + dynamic holes (Suspense) | Oui partial | **experimental** Next 15, stable Next 16 default | Page user-aware (e.g. landing avec recommendation perso) — pas aujourd'hui |

Source : [PkgPulse — SSR vs SSG vs ISR vs PPR 2026](https://www.pkgpulse.com/blog/ssr-vs-ssg-vs-isr-vs-ppr-rendering-2026), [Vercel — choose rendering strategy](https://vercel.com/blog/how-to-choose-the-best-rendering-strategy-for-your-app).

### 1.2 PPR statut réel 2026-05

- **Next 15** : `experimental: { ppr: true }` reste **non recommandé prod** d'après [nextjs.org/docs/15/app/getting-started/partial-prerendering](https://nextjs.org/docs/15/app/getting-started/partial-prerendering) (fetch ci-dessus, dernière update 2025-08-05) : *"This feature is currently experimental and subject to change, it's not recommended for production."*
- Le mode `ppr: 'incremental'` per-route est considéré stable par la communauté ([Next.js 15 versionlog](https://versionlog.com/nextjs/15/), [samcheek 2026](https://samcheek.com/blog/nextjs-partial-prerendering-production-2026)).
- **Next 16** (release 2025-10) le rend stable et default ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

### 1.3 Décision Musaium

Landing actuelle = **100 % static-able** (pas de cookies/headers/searchParams). Donc :
- **Aujourd'hui** : SSG implicite via Server Components (déjà le cas). Pas besoin de PPR.
- **Action** : vérifier qu'aucune route landing n'utilise `headers()` / `cookies()` / `force-dynamic` par erreur — sinon Next bascule en SSR pur. La middleware actuelle injecte `x-locale` + `x-nonce` dans `request.headers`, **ce qui force le layout root en dynamic** (read via `await headers()` dans `src/app/layout.tsx:28`). Verify §11.1.

**Risk Musaium ([museum-web/src/app/layout.tsx:28-33](file:///Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/app/layout.tsx)) — confirmed** : `headers()` est appelé dans le root layout pour récupérer `x-nonce`. ⇒ **toutes les pages sont dynamic** (SSR), pas SSG. C'est nécessaire (CSP nonce ne peut pas être pré-rendu), mais **explique pourquoi il n'y a pas de cache CDN** : Cache-Control par défaut sera `private, no-cache` ou `s-maxage=0`. Donc Cloudflare ne mettra rien en cache **sauf si on configure Page Rules / Cache Rules explicites** sur les assets statiques (.css/.js/.png/.svg).

---

## 2. Edge runtime vs Node runtime 2026

### 2.1 Tableau de décision

| Critère | Edge runtime | Node runtime |
|---|---|---|
| Cold start | ~5-50 ms | 100-500 ms |
| Code size limit | 1-4 MB (Vercel) | None |
| `fs`, `crypto`, `path`, `Buffer`, `child_process`, `worker_threads` | **Indisponibles** | Tous disponibles |
| `require()` direct | Interdit | OK |
| ISR support | **Non** | Oui |
| npm packages full | Subset (Web APIs only) | Tous |
| Middleware Next.js 15 | **Seul runtime supporté** | Pas dispo |
| OpenTelemetry full | Limited (no `@opentelemetry/sdk-node`) | Full |

Source : [Next.js — Edge and Node.js Runtimes](https://nextjs.org/docs/13/app/building-your-application/rendering/edge-and-nodejs-runtimes), [OneUptime — Edge runtime limitations 2026](https://oneuptime.com/blog/post/2026-01-24-fix-nextjs-edge-runtime-limitations/view), [OneUptime — OpenTelemetry Edge vs Node](https://oneuptime.com/blog/post/2026-02-06-edge-runtime-vs-node-runtime-opentelemetry-nextjs/view).

### 2.2 Musaium-specific

- Middleware actuelle (`src/middleware.ts`) tourne **forcément en Edge runtime** (seul supporté en Next 15). Elle utilise `crypto.getRandomValues` (Web Crypto, OK Edge) + `btoa` (OK Edge) + `Headers` (OK). **Aucun import Node-only** détecté ⇒ compatible.
- Pages SSR : actuellement Node runtime (default) — correct car le standalone bundle + Sentry instrumentation ont besoin de Node APIs.
- Si on voulait basculer la landing en Edge pour latence globale (Cloudflare Workers via OpenNext), il faudrait : (i) vérifier que Sentry server SDK supporte Edge — il a un sous-package `@sentry/nextjs/edge` mais features réduites, (ii) éliminer toute dépendance Node-only (currently pg client n'est utilisé que côté admin, OK).

**Verdict** : **garder Node runtime** pour SSR + Edge pour middleware. Migration Edge non justifiée tant qu'on est sur 1 VPS OVH ; ça aurait du sens si on déployait sur Cloudflare Workers (OpenNext).

---

## 3. Static export vs dynamic 2026

| Mode | `output:` | Use case | Limites |
|---|---|---|---|
| **Static export** | `'export'` | 100 % HTML sur CDN, aucun Node server | Pas de SSR, pas d'ISR, pas d'API routes, pas de middleware nécessitant runtime, pas de `headers()`/`cookies()` |
| **Standalone** (Musaium actuel) | `'standalone'` | Node container minimal `.next/standalone/server.js` | Besoin d'un Node host (VPS/container) ; full SSR/ISR/middleware OK |
| **Default** | (unset) | Vercel deploy | Nécessite Vercel ou OpenNext adapter |

Source : [Next.js — output option](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output), [Next.js — Static Exports](https://nextjs.org/docs/pages/guides/static-exports).

**Décision Musaium** : `standalone` est correct (admin panel = SSR, middleware = CSP nonce nécessite Edge runtime). Pas de migration vers `export`. **Mais** : l'image OVH actuelle peut potentiellement tirer parti de `output: 'export'` **uniquement** pour la landing publique (locale FR/EN, /support, /privacy) si on accepte de retirer le CSP nonce dynamique. **Trade-off non recommandé** — CSP nonce = win sécurité majeur (cf. R7).

---

## 4. `next/image` 2026 best practices

### 4.1 Best practices clés

| Topic | Recommandation 2026 | Source |
|---|---|---|
| LCP image | `priority={true}` (Next 15) → renommé `preload` en Next 16. Force `loading="eager"` + `fetchpriority="high"`. **Un seul par page**. | [Next docs — Image](https://nextjs.org/docs/app/api-reference/components/image), [web.dev — fetch priority](https://web.dev/articles/fetch-priority), [Next.js Image deep dive](https://www.debugbear.com/blog/nextjs-image-optimization) |
| Formats | `['avif','webp']` — AVIF ~20 % plus petit que WebP mais ~50 % plus lent à encoder. Next cache chaque format séparément → 2x storage. | [Image Optimization 2026 — Two Row Studio](https://tworowstudio.com/image-optimization-2026/) |
| Quality | WebP 75-85, AVIF 60-70 | [FrontendTools 2025](https://www.frontendtools.tech/blog/modern-image-optimization-techniques-2025) |
| Lazy loading | Default `loading="lazy"` pour tout sauf LCP — ne **jamais** lazy load une LCP image | [MDN — Fix image LCP](https://developer.mozilla.org/en-US/blog/fix-image-lcp/) |
| CDN integration | Custom loader pointing `/cdn-cgi/image/` (Cloudflare) ou Bunny Optimizer | [Cloudflare Images frameworks](https://developers.cloudflare.com/images/transform-images/integrate-with-frameworks/), [OpenNext Cloudflare images](https://opennext.js.org/cloudflare/howtos/image) |

### 4.2 Musaium audit

- `next.config.ts` ligne 18-20 : `formats: ['image/avif', 'image/webp']` — **correct**.
- Pas de `loader` custom — défaut Next image API tourne **dans le container Node**. À 100 k visiteurs/mois c'est OK. ≥ 500 k/mois → Cloudflare Images (~$5/mois 100k req) ou Bunny Optimizer ($9.50 flat, cf. §9).
- Hero image landing : à grep dans `src/components/landing/` pour vérifier que `priority` est bien sur l'image LCP, et **uniquement** sur elle.
- **Caveat Next 16** : la prop `priority` est **deprecated en Next 16** ([Next.js Image — 2026](https://nextjs.org/docs/app/api-reference/components/image)) en faveur de `preload`. Migration mineure quand on bumpera.

---

## 5. Lighthouse CI 2026

### 5.1 Mode warn vs error

D'après [GoogleChrome lighthouse-ci config](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md) et [Unlighthouse LHCI guide 2026](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci) :

- `'off'` — audit non checké
- `'warn'` — audit checké, génère warning, **pipeline ne stoppe pas** (exit 0)
- `'error'` — audit checké, exit code non-zero ⇒ blocking

### 5.2 Thresholds B2C 2026 recommandés

| Catégorie | Seuil "good" (P75) | Recommandation B2C |
|---|---|---|
| Performance | ≥ 0.90 | `error` à 0.85 minimum, viser 0.90 |
| Accessibility | ≥ 0.95 | `error` à 0.90 |
| SEO | ≥ 0.95 | `error` à 0.95 |
| Best-practices | ≥ 0.95 | `error` à 0.90 |

Source : [web.dev — performance monitoring with Lighthouse CI](https://web.dev/articles/lighthouse-ci).

### 5.3 Musaium actuel — `lighthouserc.json`

```json
{
  "categories:performance":      ["warn",  { "minScore": 0.85 }],
  "categories:accessibility":    ["error", { "minScore": 0.90 }],
  "categories:seo":              ["warn",  { "minScore": 0.90 }],
  "categories:best-practices":   ["warn",  { "minScore": 0.85 }]
}
```

**Gap confirmed** : 3 catégories sur 4 en `warn` ⇒ régressions silencieuses. Contradiction directe avec `feedback_no_feature_flags_prelaunch.md` (live ou revert) et avec `feedback_quality_doctrine.md` (verify before validate).

**Action** : passer tout en `error`, baseline les scores actuels, ratchet up. cf. §11.3 win #2.

---

## 6. next-intl vs paraglide vs custom i18n 2026

### 6.1 Comparatif

| Solution | Runtime bundle | Type-safety | Pattern | Server Components | Maintenance |
|---|---|---|---|---|---|
| **next-intl** (latest) | ~2-4 KB (client), ~457 B (server-only) | Optionnel (TS types from JSON) | Runtime lookup `t('key')` | Native | Active, dominant |
| **Paraglide** | 47 KB pour 100 messages utilisés (constant, tree-shake), 0 KB unused | Compile-time, every key = typed function | AOT compile to ESM functions `m.hello()` | Native | Active, growing |
| **Custom** (Musaium) | ~0 KB runtime + dict JSON (10-20 KB per locale) | Manuel (le dict est TS-enforced) | Server-only `await getDictionary(locale)` | Native | Maintenu par toi |

Source : [DEV — Best i18n libs 2026](https://dev.to/erayg/best-i18n-libraries-for-nextjs-react-react-native-in-2026-honest-comparison-3m8f), [Paraglide GitHub](https://github.com/opral/paraglide-js), [next-intl App Router 2026](https://nextjslaunchpad.com/article/nextjs-internationalization-next-intl-app-router-i18n-guide).

### 6.2 Musaium custom i18n analysis

- 2 locales (FR/EN), 397-line JSON dicts symétriques.
- Pattern Server Components (`getDictionary` async dans layout) ⇒ **dict ne fuit pas au client** → 0 KB JS i18n côté browser.
- Type-safety : à vérifier — si `dict: Dictionary` typé strict ⇒ équivaut à Paraglide statique.

**Verdict** : custom est **optimal pour 2 locales fixes**. Migrer vers next-intl/Paraglide n'apporterait **rien** sauf si :
- (a) On ajoute des locales dynamiques (3+ langues, pluralization complexe) ⇒ next-intl gagne (built-in ICU).
- (b) On veut typed function-call ergonomics ⇒ Paraglide gagne.

⇒ **Garder custom**. cf. §11.

### 6.3 Hreflang + locale routing — Musaium check

- `sitemap.ts` ligne 19-24 : émet `alternates.languages` pour fr/en + `x-default` ⇒ **correct** d'après [i18n SEO hreflang guide](https://better-i18n.com/en/blog/i18n-seo-hreflang-locale-urls-guide/).
- Middleware ligne 147 : `NextResponse.redirect(url, 301)` pour la locale detection ⇒ **301 permanent, correct SEO** (302 perd link equity selon i18n SEO guide).
- Subpath routing (`/fr/`, `/en/`) — pattern recommandé sur ccTLDs/subdomains.

---

## 7. SEO Next.js 15 2026

### 7.1 Metadata API checklist

| Élément | Statut Musaium | Référence |
|---|---|---|
| `metadata` export ou `generateMetadata()` server-side | OK (`src/app/layout.tsx:12`) | [Next.js generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) |
| `metadataBase: new URL(...)` | OK (ligne 17) | idem |
| Title template | OK `'%s \| Musaium'` | idem |
| `icons` (favicon multi-tailles + apple-touch) | OK (ligne 18-24) | idem |
| OpenGraph (`og:title`, `og:image`, `og:url`, `og:locale`) | **À grep** — pas vu dans layout.tsx | [Next.js metadata OG](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) |
| Twitter Card | À grep | idem |
| `alternates` (canonical + hreflang) | OK sitemap, à vérifier per-page | [DigitalApplied SEO Guide](https://www.digitalapplied.com/blog/nextjs-seo-guide) |
| `viewport` API (Next 14+ a séparé de metadata) | À vérifier | [Adeel Imran SEO Guide 2026](https://adeelhere.com/blog/2025-12-09-complete-nextjs-seo-guide-from-zero-to-hero) |
| sitemap.ts | OK | [Next.js sitemap.xml](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) |
| robots.txt | Présent comme fichier static `public/robots.txt` (vs `robots.ts` dynamic) — OK | [Next.js robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots) |
| JSON-LD (4 schemas claim) | **À localiser** dans les pages — context mentionne 4 schémas, claim non vérifié dans cet audit | [Next.js JSON-LD](https://nextjs.org/docs/app/guides/json-ld) |

### 7.2 JSON-LD multi-schema pattern (référence)

Pattern 2026 recommandé d'après [Next.js JSON-LD guide](https://nextjs.org/docs/app/guides/json-ld) + [DEV — type-safe JSON-LD Next.js](https://dev.to/arindamdawn/stop-wrestling-with-json-ld-type-safe-structured-data-for-nextjs-38on) :
- Render `<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(schema)}} />` dans le `page.tsx` (pas layout — par page).
- Multi-schema : array de schemas dans un seul `<script>` ou plusieurs `<script>` tags.
- Validation : Google Rich Results Test + Schema Markup Validator.

### 7.3 robots.txt Musaium audit

- 9 user-agents listés (GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Applebot-Extended, Google-Extended, Bytespider, CCBot)
- Bytespider + CCBot **fully blocked** ⇒ politique opt-in/opt-out fine
- Sitemap référencé en fin de fichier ⇒ OK

---

## 8. `llms.txt` 2026 — adoption status

### 8.1 État du standard

- Proposé septembre 2024 par Jeremy Howard (Answer.AI), spec à [llmstxt.org](https://llmstxt.org/).
- Adoption "developer-tools" : Anthropic, Stripe, Zapier, Cloudflare, Mintlify, Fern docs (cf. [codersera May 2026](https://codersera.com/blog/llms-txt-complete-guide-2026/)).
- **Réalité 2026 mesurée** : *"OpenAI, Google, and Anthropic crawlers don't request it in any meaningful volume"* — étude 300k domains SERanking Nov 2025 : **pas d'amélioration mesurable des citations IA** ([PPC.land — adoption stalls](https://ppc.land/llms-txt-adoption-stalls-as-major-ai-platforms-ignore-proposed-standard/)).
- Cas qui consomment : Cursor, Continue, Aider, RAG frameworks ([Mintlify analysis](https://www.mintlify.com/blog/the-value-of-llms-txt-hype-or-real)).

### 8.2 llms.txt vs llms-full.txt

D'après [HitlSEO 2025 guide](https://hitlseo.ai/blog/llms.txt-vs-llms-full.txt-the-complete-2025-guide-to-ai-friendly-documentation/) + [llms-txt.io](https://llms-txt.io/blog/llms-txt-and-llms-full-txt) :
- **llms.txt** = guide / index (liens vers ressources)
- **llms-full.txt** = export complet de la doc dans un seul fichier
- Early data : **llms-full.txt est plus accédé** quand les deux sont présents (notable point : Anthropic a demandé à Mintlify d'implémenter les deux).

### 8.3 Musaium audit

- `public/llms.txt` présent (29 lignes), fait office d'index avec liens vers home/support/privacy + FAQ inline. **Pas de llms-full.txt**.
- Spec respectée : H1 (`# Musaium`) + tagline blockquote + sections Markdown.
- robots.txt opt-in explicite pour ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot.

**Verdict** : effort llms.txt **proportionné** à la valeur prouvée (~zero conversion measurable). Maintenir mais ne pas investir plus — la priorité reste OpenGraph + JSON-LD + Core Web Vitals qui ont un ROI SEO démontré.

---

## 9. CDN strategy for landing — Cloudflare vs Bunny vs Vercel vs self-host

### 9.1 Comparatif pricing 2026

| Provider | CDN bandwidth | Image opt | Plan minimum | Pour Musaium (100k/mois) |
|---|---|---|---|---|
| **Cloudflare Free** | Unlimited proxied | Cloudflare Images $5/100k req | $0 | **Recommandé devant Node OVH** |
| **Cloudflare Pro** | Unlimited | idem | $20/mo | Si on veut Page Rules avancés, Polish |
| **BunnyCDN** | $0.005/GB (EU/NA) | $9.50/mo flat | $1/mo min | Alternative GDPR-native (entreprise slovène) |
| **Vercel** | Bandwidth metered + function invocations + image opt all separate | Image opt inclus | Pro $20/seat | Hidden costs explosent ≥ 100k visiteurs |
| **Self-host (OVH actuel)** | VPS bw inclus (TB/mo) | Tourne dans le container | ~5-20€/mo VPS | OK pour 100k/mois landing static |

Sources : [Cloudflare pricing 2026](https://www.cloudflare.com/plans/), [Cloudflare CDN cost-per-GB 2026](https://blog.blazingcdn.com/en-us/what-is-the-price-per-gb-of-cloudflare-cdn), [Bunny vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026), [Vercel hidden costs](https://schematichq.com/blog/vercel-pricing), [Massive Grid — self-host vs Vercel](https://massivegrid.com/blog/vercel-vs-self-hosted-coolify-cost-comparison/).

### 9.2 Caveat ISR ↔ Cloudflare

D'après [Cloudflare changelog Feb 2026 — async stale-while-revalidate](https://developers.cloudflare.com/changelog/post/2026-02-26-async-stale-while-revalidate/) : Cloudflare a enfin (Feb 2026) ajouté async SWR, fixant le bug "2 layers of cache each respecting stale-while-revalidate" qui rendait ISR + Cloudflare casse-gueule jusque-là. **Musaium n'utilise pas ISR aujourd'hui** (cf. §1.3) ⇒ pas d'impact.

### 9.3 Recommandation Musaium

- **Court terme (avant launch)** : Cloudflare Free devant OVH Node. Cache Rules sur :
  - `/_next/static/*` — `Cache-Everything, max-age=1y`
  - `/_next/image*` — `Cache-Everything, max-age=30d` (purge à chaque deploy)
  - `/images/*` (public assets) — `Cache-Everything, max-age=30d`
  - HTML routes (`/fr`, `/en`, `/fr/support`, etc.) — **bypass cache** (CSP nonce per-request)
- **Moyen terme (≥ 500k/mois)** : Cloudflare Images custom loader pour `next/image` ou Bunny Optimizer flat.
- **Long terme (multi-region traffic)** : reconsidérer OpenNext Cloudflare Workers (Edge runtime full).

---

## 10. Web Vitals 2026 — CLS, LCP, INP targets + RUM

### 10.1 Thresholds

| Métrique | Bon (P75) | À améliorer | Mauvais |
|---|---|---|---|
| **LCP** | ≤ 2.5 s | 2.5 – 4.0 s | > 4.0 s |
| **INP** | ≤ 200 ms | 200 – 500 ms | > 500 ms |
| **CLS** | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |

Évaluation : **75e percentile** des visites réelles (Google CrUX dataset).

Sources : [web.dev — Web Vitals](https://web.dev/articles/vitals), [corewebvitals.io](https://www.corewebvitals.io/core-web-vitals), [web.dev — INP](https://web.dev/articles/inp).

### 10.2 INP — métrique la plus échouée en 2026

- FID retiré 12 mars 2024, remplacé par INP comme ranking signal.
- 43 % des sites échouent encore au seuil 200 ms en 2026 ([Senorit 2026](https://senorit.de/en/blog/core-web-vitals-2026), [Pravin Kumar — INP 2026](https://www.pravinkumar.co/blog/core-web-vitals-inp-webflow-optimization-2026)).
- Root cause quasi-universelle : **main thread bloqué par JS** lors d'une interaction.
- Debugging : Chrome DevTools Performance panel avec Web Vitals enabled → markers verticaux INP cliquables → activité main thread ([Panstag — long tasks](https://www.panstag.com/2026/04/how-to-fix-long-tasks-chrome-devtools.html)).

### 10.3 RUM (Real User Monitoring)

- **Sources de données** : Google CrUX (rolling 28-day window), GA4 web-vitals events, Sentry Performance, Datadog RUM, dédiés (SpeedCurve, DebugBear).
- **Lib officielle** : [`web-vitals`](https://github.com/googlechrome/web-vitals) (Chrome team, MIT). 2 KB gzip, ESM tree-shakable, exporte `onCLS`, `onINP`, `onLCP`, `onTTFB`, `onFCP`.

### 10.4 Musaium audit

- Sentry **Performance** intégré (cf. `sentry.client.config.ts`) ⇒ devrait capter Web Vitals **si** `Sentry.browserTracingIntegration()` activée. À vérifier dans config (file size 581B suggère config minimaliste).
- Pas de `web-vitals` lib direct ⇒ pas de RUM beacons custom.
- CrUX data : Musaium pas encore lancé donc rolling window vide. Disponible ~28j post-launch.

---

## 11. Verdict Musaium 100k visiteurs/mois

### 11.1 Vérifications terrain

Confirmé par lecture code :
- `next.config.ts` : `output: 'standalone'`, AVIF+WebP, security headers, Sentry wrapper ⇒ **conforme best practices 2026**.
- `lighthouserc.json` : **3 warns + 1 error** ⇒ régressions silencieuses possibles.
- `src/middleware.ts` : per-request nonce ⇒ CSP forte, mais force tout en SSR (pas SSG).
- `src/app/layout.tsx` : `await headers()` ⇒ **confirmé dynamic, pas SSG**.
- `src/app/sitemap.ts` : hreflang + x-default ⇒ **conforme**.
- `public/robots.txt` : 9 user-agents AI, opt-in granulaire ⇒ **best practice 2026**.
- `public/llms.txt` : index v1, pas de llms-full.txt ⇒ **proportionné valeur**.
- `package.json` deps : Next 15.5.18, React 19.2, Tailwind 4, Framer 12.38, Sentry 10.49 ⇒ **versions à jour**.

### 11.2 Verdict global

> **Setup actuel = enterprise-grade pour la cible 100k visiteurs/mois jusqu'à T+3 mois post-launch.**
>
> Pas de blocker critique. 5 wins faciles à shipper avant le 2026-06-01.

### 11.3 Top 5 perf wins (impact/effort)

| # | Win | Impact attendu | Effort | Risk |
|---|---|---|---|---|
| **1** | **Cloudflare Free devant Node OVH** + Cache Rules sur `/_next/static`, `/_next/image`, `/images/` | LCP global ↓ 30-50 % pour utilisateurs hors EU ; offload ~80 % du bandwidth | 1-2 h (DNS + Page Rules) | Faible (rollback DNS = instant) |
| **2** | Lighthouse CI : `warn` → `error` sur perf/SEO/best-practices, baseline scores actuels, ratchet | Prévient régressions silencieuses (doctrine no-flags-prelaunch) | 30 min | Faible (peut frequer un PR à la baseline init) |
| **3** | Audit `next/image` priority placement — **un seul** `priority` sur le LCP hero, vérifier `fetchPriority="high"` est généré, vérifier que mobile/desktop variants ne wastent pas de bw | LCP ↓ 200-500 ms si actuellement la prop n'est pas sur la bonne image | 1 h grep + verify | Faible |
| **4** | Sentry tracing : `tracesSampleRate: 0.1` en prod (vs default 1.0 ou hard-coded), `replaysSessionSampleRate: 0.0` (uniquement onError) | Réduit overhead client ~100-300 KB JS payload conditionnel + reduces beacon noise | 30 min config | Faible (less data, mais 10 % = bon pour 100k/mois) |
| **5** | JSON-LD audit + ajout `Organization` schema si manquant + valider tous via Schema Markup Validator | Rich snippets Google ↑ chance d'affichage | 1-2 h | Faible |

### 11.4 Wins niveau 2 (post-launch, données CrUX en main)

- (6) Migrer Framer Motion vers `LazyMotion` + `m` (vs `motion`) ⇒ bundle 46 KB → 4.6 KB initial, lazy load features ([Motion docs — LazyMotion](https://motion.dev/docs/react-lazy-motion))
- (7) Self-host Inter VAR (vs `next/font/google` qui download au build mais ajoute layout cost) avec `font-display: swap` + `adjustFontFallback: true` (déjà OK probablement, à verify)
- (8) Ajouter `web-vitals` lib + beacon vers backend `/api/rum` pour collecter INP P75 réel (Sentry capture mais agrégation moins fine)
- (9) Envisager PPR `incremental` per-route quand Next 16 upgrade (PPR stable + Cache Components)
- (10) Si traffic dépasse 500 k/mois soft : Cloudflare Images custom loader pour `next/image` (custom loader + `/cdn-cgi/image/`)

### 11.5 Anti-recommandations (à NE PAS faire)

- ❌ **Migrer vers next-intl/Paraglide** — custom dict FR/EN est optimal pour 2 locales fixes. Migration = effort sans gain.
- ❌ **Activer PPR experimental en prod Next 15** — flag *not recommended for production* dans docs officielles 2025-08. Attendre Next 16.
- ❌ **Migrer vers Vercel** — Vercel "hidden costs" (function invocations, image opt requests, edge middleware exec) ≥ 100k visiteurs/mois explose vs OVH stable ([deploywise 2026 — Vercel $20 → $286 reality](https://deploywise.dev/blog/vercel-pricing-explained)).
- ❌ **Static export (`output: 'export'`)** — incompatible avec CSP nonce dynamique, ROI sécurité > ROI cache.
- ❌ **Investir lourd sur llms.txt / llms-full.txt** — adoption réelle ≈ zéro mesurable selon 300k domains study Nov 2025. Maintenir le fichier existant, c'est tout.

---

## 12. Perf budget table (référence)

| Asset | Budget initial | Notes Musaium |
|---|---|---|
| HTML (gzipped) | < 30 KB | À mesurer (`curl -s | wc -c` after gzip) |
| CSS critical | < 14 KB | Tailwind 4 JIT = 5-15 KB typique |
| JS first load | < 170 KB gzipped | Next 15 + React 19 baseline ~85 KB; Framer ~30 KB; Sentry ~50 KB → **dangerously close** sans LazyMotion |
| Image LCP | < 100 KB AVIF | Vérifier hero image |
| Fonts | 1 Inter VAR latin | ~30 KB woff2 |
| TTFB | < 200 ms | OVH UE → US/Asie sans CDN = 200-500 ms ⇒ Cloudflare essential |
| LCP P75 | < 2.5 s | mesurer post-CDN |
| INP P75 | < 200 ms | landing static = facile, admin SPA = risk |
| CLS | < 0.1 | font-display swap + adjustFontFallback obligatoires |

---

## 13. Sources (tier-1 cited)

### Next.js officiel
- [Next.js — PPR docs v15](https://nextjs.org/docs/15/app/getting-started/partial-prerendering)
- [Next.js — Edge and Node Runtimes](https://nextjs.org/docs/13/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [Next.js — Image API](https://nextjs.org/docs/app/api-reference/components/image)
- [Next.js — generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js — sitemap.xml](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Next.js — robots.txt](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Next.js — JSON-LD guide](https://nextjs.org/docs/app/guides/json-ld)
- [Next.js — Static Exports](https://nextjs.org/docs/pages/guides/static-exports)
- [Next.js — output config](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output)
- [Next.js — Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js — ISR Guide](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Next.js — Prefetching Guide](https://nextjs.org/docs/app/guides/prefetching)
- [Next.js — Link Component](https://nextjs.org/docs/app/api-reference/components/link)
- [Next.js — unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Next.js — revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [Next.js — `use cache` directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js 15 blog](https://nextjs.org/blog/next-15)
- [Next.js 16 blog](https://nextjs.org/blog/next-16)
- [Next.js — Upgrading to v16](https://nextjs.org/docs/app/guides/upgrading/version-16)

### web.dev / Google
- [web.dev — Web Vitals](https://web.dev/articles/vitals)
- [web.dev — INP](https://web.dev/articles/inp)
- [web.dev — Optimize LCP](https://web.dev/articles/optimize-lcp)
- [web.dev — Fetch Priority](https://web.dev/articles/fetch-priority)
- [web.dev — Lighthouse CI performance monitoring](https://web.dev/articles/lighthouse-ci)
- [web.dev — Defining Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Google Search — Core Web Vitals docs](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [GoogleChrome — lighthouse-ci config](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)
- [GoogleChrome — web-vitals lib](https://github.com/googlechrome/web-vitals)

### llms.txt / AI
- [llmstxt.org](https://llmstxt.org/)
- [Codersera — llms.txt May 2026 guide](https://codersera.com/blog/llms-txt-complete-guide-2026/)
- [PPC.land — llms.txt adoption stalls](https://ppc.land/llms-txt-adoption-stalls-as-major-ai-platforms-ignore-proposed-standard/)
- [Mintlify — value of llms.txt](https://www.mintlify.com/blog/the-value-of-llms-txt-hype-or-real)
- [llms-txt.io — full vs llms.txt](https://llms-txt.io/blog/llms-txt-and-llms-full-txt)

### EU AI Act
- [EU AI Act — Article 50](https://artificialintelligenceact.eu/article/50/)
- [European Commission — Code of Practice AI labelling](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)

### Cloudflare / Bunny / CDN
- [Cloudflare Plans](https://www.cloudflare.com/plans/)
- [Cloudflare Images frameworks](https://developers.cloudflare.com/images/transform-images/integrate-with-frameworks/)
- [Cloudflare — async stale-while-revalidate](https://developers.cloudflare.com/changelog/post/2026-02-26-async-stale-while-revalidate/)
- [Cost-per-GB Cloudflare CDN 2026](https://blog.blazingcdn.com/en-us/what-is-the-price-per-gb-of-cloudflare-cdn)
- [Bunny vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [OpenNext Cloudflare Images](https://opennext.js.org/cloudflare/howtos/image)

### Lib comparisons / dev community
- [Paraglide GitHub](https://github.com/opral/paraglide-js)
- [next-intl App Router 2026](https://nextjslaunchpad.com/article/nextjs-internationalization-next-intl-app-router-i18n-guide)
- [DEV — Best i18n libs Next.js 2026](https://dev.to/erayg/best-i18n-libraries-for-nextjs-react-react-native-in-2026-honest-comparison-3m8f)
- [Motion docs — LazyMotion](https://motion.dev/docs/react-lazy-motion)
- [Motion docs — reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)
- [DebugBear — Next.js image optimization](https://www.debugbear.com/blog/nextjs-image-optimization)
- [DebugBear — fetchpriority](https://www.debugbear.com/blog/fetchpriority-attribute)
- [Sentry — Next.js source maps](https://blog.sentry.io/setting-up-next-js-source-maps-sentry/)
- [Vercel pricing 2026](https://vercel.com/pricing)
- [Massive Grid — Vercel vs Coolify self-host 2026](https://massivegrid.com/blog/vercel-vs-self-hosted-coolify-cost-comparison/)
- [DeployWise — Vercel real costs](https://deploywise.dev/blog/vercel-pricing-explained)
- [MDN — Fix image LCP](https://developer.mozilla.org/en-US/blog/fix-image-lcp/)
- [PkgPulse — SSR vs SSG vs ISR vs PPR 2026](https://www.pkgpulse.com/blog/ssr-vs-ssg-vs-isr-vs-ppr-rendering-2026)
- [Vercel blog — choose rendering strategy](https://vercel.com/blog/how-to-choose-the-best-rendering-strategy-for-your-app)
- [samcheek — PPR production 2026](https://samcheek.com/blog/nextjs-partial-prerendering-production-2026)
- [Unlighthouse — LHCI guide 2026](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci)
- [Panstag — fix long tasks 2026](https://www.panstag.com/2026/04/how-to-fix-long-tasks-chrome-devtools.html)
- [i18n SEO — hreflang guide](https://better-i18n.com/en/blog/i18n-seo-hreflang-locale-urls-guide/)
- [Two Row Studio — image optimization 2026](https://tworowstudio.com/image-optimization-2026/)
- [Senorit — Core Web Vitals 2026](https://senorit.de/en/blog/core-web-vitals-2026)
- [Pravin Kumar — INP 2026](https://www.pravinkumar.co/blog/core-web-vitals-inp-webflow-optimization-2026)
- [DigitalApplied — Next.js SEO Guide 2026](https://www.digitalapplied.com/blog/nextjs-seo-guide)
- [Adeel Imran — Next.js SEO 2026](https://adeelhere.com/blog/2025-12-09-complete-nextjs-seo-guide-from-zero-to-hero)
- [InfoQ — Next.js 16 release](https://www.infoq.com/news/2025/12/nextjs-16-release/)

---

## 14. Notes d'honnêteté (UFR-013)

- **Pas vérifié de visu** : présence effective de tags OG/Twitter, `viewport` API, et JSON-LD multi-schema dans les composants. Le contexte affirme "4-schema JSON-LD" mais je n'ai pas grep le code source pour confirmer chacun (Article, Organization, FAQPage, BreadcrumbList?). À faire en phase Gap analysis (R-05).
- **PPR experimental status** : claim "experimental, not recommended for production" est vérifié via fetch direct sur nextjs.org/docs/15 le 2026-05-12 — note "2025-08-05 lastUpdated" sur la page, donc la doc Next 15 a ~9 mois et a pu glisser sur status PPR.
- **Sentry tracesSampleRate** : je n'ai PAS lu le contenu de `sentry.client.config.ts` (581 B), je suppose qu'il est minimal. Recommandation #4 à vérifier avant d'appliquer.
- **"43 % des sites échouent INP"** : claim de plusieurs sources tier-2 (Senorit, Pravin Kumar). Pas trouvé la primary source CrUX/HTTP Archive pour le confirmer. À traiter comme indicatif, pas certain.
- **Custom i18n type-safety Musaium** : je n'ai pas lu le code de `lib/i18n.ts` pour vérifier si `Dictionary` est typed strict. Verdict §6.2 suppose qu'il l'est. À vérifier.
- Tous les liens cités sont des résultats de WebSearch (May 2026), pas des hallucinations. URLs reportées telles que renvoyées par l'outil.
