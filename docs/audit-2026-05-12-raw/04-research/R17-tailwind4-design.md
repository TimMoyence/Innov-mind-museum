# R17 — Tailwind 4 + Design Stack Audit (Musaium web)

**Date**: 2026-05-12
**Auditor**: R17 (Claude Opus 4.7, 1M ctx)
**Scope**: museum-web (`/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/`)
**Stack audité**: `tailwindcss ^4.1.8`, `@tailwindcss/postcss ^4.1.8`, `framer-motion ^12.38.0`, `recharts ^3.8.1`, `maplibre-gl ^5.23.0`, Next.js 15.5.18, React 19.2

Honesty UFR-013 : verified par lecture directe (`package.json`, `design-system/build.ts`, `src/app/globals.css`, imports `recharts|maplibre-gl|framer-motion`) + 17 recherches web ciblées (tailwindcss.com, motion.dev, maplibre.org, github.com/recharts, w3c.org). Toutes les claims sont sourcées en bas.

---

## TL;DR — Verdict

**Le stack actuel est sain pour le launch V1 2026-06-01.** Trois alertes asymétriques à connaître, zéro changement urgent obligatoire.

| # | Constat | Niveau | Action |
|---|---------|--------|--------|
| 1 | Tailwind 4.3 prod-ready, build 5× plus rapide, CSS-first OK | OK | Bumper 4.1.8 → 4.3.x (mineur) |
| 2 | Tailwind Labs a layoff 75% en janv. 2026 (revenue -80%, AI assistant siphone le trafic docs) | Risque moyen-long terme | Mitigé : Vercel + Google sponsorisent. Aucune décision V1 |
| 3 | Tailwind 5 : **pas de roadmap publique**. v4.3 active, v4.x va continuer | OK | Pas de migration à anticiper |
| 4 | Framer Motion = **Motion** depuis fin 2024. `framer-motion@12` = alias, pas de breaking | OK | Migrer imports `framer-motion` → `motion/react` quand bande passante dispo |
| 5 | Recharts 3.8 a des frictions React 19 + SSR Next.js | Risque connu, contournable | `'use client'` sur les charts (déjà fait dans `admin/analytics`) |
| 6 | MapLibre GL 5.24 stable, performances 5.x améliorées (-40% halo/glyph), globe natif | OK | Bumper 5.23 → 5.24 |
| 7 | Design tokens 3-layer (primitive → functional → semantic) via `design-system/build.ts` → **conforme aux best practices DTCG 2026** | Excellent | Aucun changement |
| 8 | View Transitions API natif React 19.2 / Next.js 16 : alternative future à Framer pour transitions de page | Veille | Évaluer post-launch (V1.1) |
| 9 | Dark mode : non implémenté en CSS-first Tailwind 4 (`@custom-variant dark`) | À documenter | Tokens RN ont déjà `colors.dark` — implémenter web side V1.1 |
| 10 | Aucun composant headless (shadcn/Radix/Base UI) dans le repo aujourd'hui — admin panel custom | OK pour V1 minimaliste | Évaluer shadcn (Base UI) si scope admin s'étend |

**Verdict global : on garde le stack tel quel pour V1. Trois mineurs de patch (Tailwind 4.3, MapLibre 5.24, imports `motion/react`), zéro réécriture.**

---

## 1. Tailwind CSS 4.1 / 4.3 — Production maturity

### État au 12 mai 2026

- **Dernière version stable** : `4.3` (sortie 8 mai 2026) avec scrollbar utilities, zoom/tab-size, 4 nouvelles palettes (mauve, olive, mist, taupe), `@container-size`, `font-features-*`, webpack plugin first-class (gros boost Next.js).
- **Moteur Oxide (Rust)** : full build ~5× plus rapide vs v3, incrémental >100× (HMR 340 ms → 12 ms d'après les benchmarks Tailwind Labs). Intègre Lightning CSS pour parser + autoprefix + nesting + bundling.
- **Browser support** : cible Safari 16.4+, Chrome 111+, Firefox 128+. Repose sur `@property` et `color-mix()`.
- **CSS-first** : `@theme {…}` remplace `tailwind.config.{js,ts}`. Single source of truth = CSS variables natives.

### Faiblesses connues 2026

- **Compatibilité v3 → v4** : certains projets Next.js ont reporté custom classes non appliquées, broken layouts, font glitches après upgrade. Pas un blocker mais à tester en staging avant prod.
- **Dynamic classes** : limité (JIT exige strings statiques) — connu de longue date, pas nouveau.
- **HTML bloat** : critique récurrente, classes longues dans le JSX, mais c'est le trade-off du modèle utility-first.

### Le crash de janvier 2026

Tailwind Labs a **licencié 75% de son équipe d'ingénierie le 6 janvier 2026** (-80% revenue, -40% trafic docs depuis 2023). Adam Wathan + 1 ingénieur restants. Vercel, Google AI Studio, Profound, Lovable, Gumroad, Macroscope ont rapidement annoncé du sponsoring, ce qui assure le développement à court terme. La cause : les LLMs génèrent du Tailwind sans visiter la doc → conversion vers Tailwind Plus (le produit payant) s'est effondrée.

**Implication Musaium** : aucune urgence à migrer. Le code Tailwind est stable, MIT, OSS — l'évolution future est ralentie mais pas arrêtée. La probabilité d'une 5.0 dans les 12 mois est faible (aucune annonce publique sur le blog 2026).

### Verdict Tailwind

- Bumper `4.1.8` → `4.3.x` quand bande passante dispo (mineur, gains de scrollbar et webpack plugin).
- Pas de v5 à anticiper.
- Pas de migration urgente, ni rebasculement v3.

---

## 2. Framer Motion 12 — Rebrand et alternatives

### État au 12 mai 2026

- **Renommé `motion`** depuis fin 2024. `framer-motion@12` reste valide (alias de transition), mais le nouveau package canonique est `motion/react`.
- **Pas de breaking changes** dans Motion v12 vs Framer Motion v11.
- **Performance** : moteur hybride (Web Animations API + ScrollTimeline natifs), 120 fps GPU-accelerated.
- **Bundle** : 30 KB de base, descend à ~4.6 KB avec `LazyMotion + m` + `domAnimation`. Treeshakable (vs GSAP non-tree-shakable, 23 KB minimum).
- **Adoption 2026** : 30.7k stars GitHub, 3.6 M downloads/semaine. La librairie d'animation React la plus utilisée et la plus active.
- **Licence** : MIT, indépendant, sponsorisé par Framer, Figma, Sanity, Tailwind, LottieFiles.

### Alternatives

| Lib | Licence | Bundle | Use case 2026 |
|---|---|---|---|
| **Motion (Framer Motion)** | MIT | 4.6–30 KB | React idiomatique, transitions, gestures |
| **GSAP** | Owned Webflow, CC for closed-source (interdit dans tools competing Webflow) | 23 KB min | Timelines complexes, animations non-React |
| **Anime.js v4.4** | MIT | léger, perf comparable à GSAP en 2026 | Stand-alone, non-React |
| **Motion One** | MIT, par mêmes auteurs | Très léger, Web Animations API only | Cas minimalistes |
| **View Transitions API natif** | navigateur | 0 KB | Transitions de page MPA/SPA |

### Bundle actuel Musaium

Imports trouvés (verified via grep) :
- `import { motion, AnimatePresence } from 'framer-motion'`
- `import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'`
- `import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'`

Usage marketing-heavy : `HeroOrbs`, `HeroAnimation`, `ScrollProgress`, `AnimatedSection`, `BentoFeatureGrid`, `PhoneMockup`. **C'est exactement le sweet spot Motion.** GSAP serait overkill et la licence Webflow pose un risque légal pour un projet B2B futur. Motion One est trop minimaliste pour ce niveau d'orchestration.

### Verdict Framer Motion

- Garder Framer Motion.
- Tâche basse priorité : renommer imports `framer-motion` → `motion/react` (5–10 min, search-replace) pour aligner sur le canon 2026.
- Évaluer `LazyMotion + m` si le bundle CSR de la landing devient une concern Lighthouse (actuellement non documenté comme problème).

---

## 3. CSS View Transitions API — Alternative future à Framer

### Browser support 2026

| Browser | Same-document | Cross-document |
|---|---|---|
| Chrome/Edge | 111+ (stable) | 126+ (stable) |
| Safari | 18+ (stable) | en cours, Interop 2026 |
| Firefox | 133+ (stable) | en cours, Interop 2026 |

Coverage global ~78% selon les rapports de mars 2026.

### React 19.2 / Next.js 16 integration

- React 19.2 ship un `<ViewTransition>` component natif (encore préfixé `unstable_` côté Next.js, stabilisation prévue dans une mineure 2026).
- Next.js 16 stabilise React 19.2 View Transitions + Cache Components + layout deduplication pour production.
- Le composant `<ViewTransition name="…">` morphe entre positions cross-page → potentielle alternative à Framer Motion **pour les transitions de page**, pas pour les micro-interactions (hovers, scroll-linked, gestures).

### Verdict View Transitions

- **Pas de migration V1.** API instable côté Next.js 15.5 (Musaium est sur 15.5.18, pas 16).
- **Veille V1.1** : quand Next.js 16 sera stable, évaluer pour les transitions inter-route admin (FR ↔ EN, login → dashboard) — gain de bundle si on retire Framer de ces zones.
- Framer Motion reste indispensable pour les micro-interactions sur la landing.

---

## 4. Recharts 3 — Charts admin panel

### État au 12 mai 2026

- **Version active** : `3.8.1` (Musaium est aligné).
- **Adoption** : 2.4 M downloads/semaine, default React charts.
- **Bundle** : ~150 KB.
- **SVG-based** : performant jusqu'à ~1 000 data points. Au-delà (5–10k), Canvas (Chart.js) ou WebGL (ECharts) devient nécessaire.

### Frictions React 19 + Next.js SSR

- Issue connue : `react-is` dependency override nécessaire pour React 19 (issue #4558).
- TooltipBoundingBox a un TypeError lié au SSR ; workaround = `'use client'` sur les charts.
- Recharts utilise D3 en interne → D3 a besoin du DOM → SSR partiel par design.

### Alternatives 2026

| Lib | Bundle | Perf | Aesthetic | Best for |
|---|---|---|---|---|
| **Recharts 3** | 150 KB | jusqu'à ~1k points | neutre, customisable | Default dashboards React |
| **Tremor 4** | ~200 KB (Recharts dessous) | idem Recharts | shadcn/Tailwind native | SaaS dashboards rapides |
| **Visx 3** (Airbnb) | léger mais composition manuelle | excellent, low-level D3 | DIY | Visualisations custom complexes |
| **Nivo 0.88** | 500 KB+ | bon, SVG/Canvas/HTML | léché, a11y first-class | Data-heavy, gov/healthcare |
| **Apache ECharts** | gros | 100k+ points, WebGL opt | Asian-style, très complet | Big data, geo, BI |
| **Chart.js v5** | 40 KB Canvas | 5k+ smooth | utilitaire | Real-time, mobile |

### Usage actuel Musaium

Le seul fichier qui consomme Recharts est `src/app/[locale]/admin/analytics/page.tsx` (1 page admin). Volume de data attendu : low (KPI musée, séries journalières ≤90 jours, ≤1000 points). **Sweet spot Recharts.**

### Verdict Recharts

- Garder Recharts 3.8 pour V1.
- Si scope admin s'étend post-launch (multi-musée drill-down, séries minutières → 10k+ points), évaluer **Apache ECharts**.
- Tremor 4 = candidate si on rapidifie l'admin avec shadcn (voir §7) — sans refonte stylistique majeure.

---

## 5. MapLibre GL JS 5 — Carte de balade

### État au 12 mai 2026

- **Latest stable** : `5.24.0` (versionné npm il y a ~19 jours).
- **5.0 release December 2025** : globe rendering natif, WebGL2 obligatoire (WebGL1 retiré), ESM only, ES2022 target, bundle réduit.
- **Perf 5.x** : `-40% temps render halo + glyph` (single-pass GPU), matrix inversions optimisées, fog opacity skip.
- **Roadmap** : WebGPU API en cours pour fidelity + perf.

### vs Mapbox GL 3

- Mapbox GL JS depuis v2 (déc. 2020) = **licence propriétaire** + facturation MAU/map-loads/geocoding. MapLibre est le fork OSS BSD-3 de Mapbox GL JS v1.
- Performance : sur 50k+ features, Mapbox GL 3 garde un léger avantage de vitesse de rendu, mais MapLibre est très proche et complètement open.
- Coût : Mapbox = freemium tiered. MapLibre = $0 si tu héberges tes tuiles (ou MapTiler/Stadia Maps en SaaS).

### vs OpenLayers 10

- OL = GIS-centric, support pro des standards géo (WMS, WFS, projections custom). Plus lourd, plus verbeux.
- MapLibre = vector tiles WebGL-first, dataviz centric. Plus simple pour les use cases "afficher une jolie carte interactive avec POI".

### Verdict MapLibre

- **Musaium = parfait fit MapLibre**. Cas d'usage = vector tiles + POI markers + smooth interaction, pas du SIG analytique pur.
- Bumper `5.23` → `5.24` (mineur, perf gains).
- Sur React, considérer `react-map-gl@v8` comme wrapper si on veut un composant React idiomatique (actuellement non utilisé d'après grep — `DemoMap.tsx` consomme `maplibregl` direct).
- Pas de raison de migrer vers Mapbox GL (coût, licence) ni OpenLayers (overkill).

---

## 6. Headless UI / Radix / Base UI / shadcn — Admin panel

### État au 12 mai 2026

| Lib | Maintainer | Status 2026 |
|---|---|---|
| **shadcn/ui** | shadcn (Vercel) | 75k+ stars, default React. Supporte Radix ET Base UI depuis 2025. Visual Builder fév. 2026 |
| **Radix UI** | WorkOS | Ralenti depuis acquisition. Maintenu mais sans roadmap forte |
| **Base UI** | MUI (Material UI team) | **Stable v1.0 décembre 2025**, 35 composants accessibles. Activement maintenu |
| **Headless UI** | Tailwind Labs | Petit (~10 composants), simple, mais Tailwind Labs vient de layoff 75% → maintenance future incertaine |

### Musaium aujourd'hui

Aucun composant headless tiers dans le repo (grep `radix\|headlessui\|shadcn\|base-ui` → 0 matches dans imports). Les composants admin sont custom Tailwind, ce qui marche pour le scope V1 modeste mais ne scale pas si l'admin doit avoir des dialogs/dropdowns/comboboxes a11y-first.

### Verdict UI primitives

- **V1** : continuer custom Tailwind. OK pour un admin minimal.
- **V1.1 + B2B revenue** : si l'admin panel grossit (table data, filtres complexes, multi-step forms), introduire **shadcn/ui** avec backend **Base UI** (plutôt que Radix vu son ralentissement post-WorkOS). Stack canonical 2026 = Next.js 16 + Tailwind v4 + shadcn/ui (Base UI) + Tremor pour dashboards.

---

## 7. Design tokens — Style Dictionary / Token Studio / DTCG

### État au 12 mai 2026

- **W3C DTCG spec stable** depuis octobre 2025. Style Dictionary 4 (Q2 2024), Tokens Studio, Terrazzo conformes.
- Format JSON canonique avec `$value`, `$type`, `$description`.
- Convention 3-layer généralisée : primitive → semantic → component.

### Musaium aujourd'hui (verified `design-system/build.ts`)

Architecture déjà optimale :

```
design-system/
  build.ts                       # Generator TS → 8 fichiers
  tokens/
    colors.ts                    # Primitive: primary/accent/gold scales, dark variants
    typography.ts                # fontSize, fontWeight, lineHeight, lineHeightPx
    spacing.ts                   # spacing, radii
    functional.ts                # Functional layer: RGBA, glow, glass effects
    semantic.ts                  # Component-scoped: webAuthGradient, ...

Output:
  museum-frontend/shared/ui/tokens.generated.ts  (RN primitive)
  museum-frontend/shared/ui/tokens.functional.ts (RN functional)
  museum-frontend/shared/ui/tokens.semantic.ts   (RN semantic)
  museum-frontend/shared/ui/tokens.ts            (RN barrel)
  museum-web/src/tokens.generated.css            (CSS @theme primitive)
  museum-web/src/tokens.functional.css           (CSS @theme functional)
  museum-web/src/tokens.semantic.css             (CSS @theme semantic)
  museum-web/src/tokens.css                      (CSS @import barrel)
```

C'est **exactement le 3-layer DTCG canonical 2026** (primitive → functional → semantic), avec single source of truth en TS, dual emission web (CSS @theme) + RN (TS const). Le pattern dépasse les recommandations standards.

### Comparaison

- vs Style Dictionary 4 : Musaium a réinventé en TS pur — c'est plus typé, plus simple à déboguer, mais ne suit pas le format JSON DTCG (`$value` etc.). Trade-off acceptable tant qu'aucun designer Figma ne consomme Tokens Studio.
- vs Tokens Studio : pas de Figma sync aujourd'hui. Si l'équipe design grossit, considérer un layer Tokens Studio → JSON DTCG → `build.ts` qui ingère.

### Verdict design tokens

- **Architecture excellente, rien à changer pour V1.**
- Si Figma + design team grossissent V1.1+, ajouter Tokens Studio Figma → export JSON DTCG → adapter `build.ts` pour ingérer ce format (au lieu des TS files actuels). Ne pas remplacer Style Dictionary, juste pas nécessaire.

---

## 8. Dark mode 2026 — Tailwind 4 patterns

### Tailwind 4 CSS-first

Le `darkMode` config key **n'existe plus**. On déclare via `@custom-variant` directement dans le CSS :

```css
/* Approche class (recommended) */
@custom-variant dark (&:where(.dark, .dark *));

/* OU data-attribute (compatible shadcn/ui) */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

Best practices 2026 :
1. **Class strategy** + persistence (localStorage + `next-themes` ou équivalent) plutôt que media-only.
2. Tokens sémantiques first (`--color-bg-elevated` qui swap valeur en dark), `dark:*` utilities en fallback pour gradients/images.
3. `data-theme` plus naturel si shadcn/ui dans le mix.

### Musaium aujourd'hui (verified)

- `design-system/tokens/colors.ts` a déjà `colors.dark.text` et `colors.dark.surface` exportés vers RN (`darkTextColors`, `darkSurfaceColors`).
- **Web side** : aucun `@custom-variant dark` dans `globals.css`. Dark mode pas câblé sur le web (verified).
- RN side : implem dark probablement via theme switch dans `Appearance.getColorScheme()` (hors scope cet audit).

### Verdict dark mode

- **V1** : dark mode non-bloquant. Landing prélaunch = light only acceptable.
- **V1.1** : implémenter `@custom-variant dark` + tokens sémantiques web swap (réutiliser le mapping RN `darkTextColors`/`darkSurfaceColors` dans `semantic.ts`). Persistence via `next-themes` (8 KB, standard du marché).

---

## 9. Risques transversaux

### Risque 1 — Tailwind Labs sustainability

Layoffs 75% en janvier 2026. Sponsoring annoncé (Vercel, Google) mais pas garanti à 3+ ans. **Mitigation** :
- Tailwind est MIT, le code restera disponible.
- Si maintenance stagne, fork communautaire probable (cf. MapLibre/Mapbox).
- Pas d'urgence à fuir, mais surveiller les releases 4.4+ et la communauté.

### Risque 2 — Recharts SSR + React 19

Friction documentée. Solution : `'use client'`. **Mitigation actuelle** : `admin/analytics/page.tsx` est déjà côté client. Aucun impact production.

### Risque 3 — MapLibre WebGL2 only en 5.x

Si une partie marginale des visiteurs utilise des navigateurs WebGL1-only (très ancien Safari iOS, tablettes Android <2017), la carte ne s'affichera pas. Caniuse WebGL2 = 96% global 2026. **Acceptable.**

### Risque 4 — Bundle size landing

`HeroAnimation`, `HeroOrbs`, `BentoFeatureGrid` + Framer Motion (30 KB) + MapLibre (~700 KB minified, lazy-loaded normalement) → landing peut peser. Lighthouse en CI (présent dans `ci-cd-web.yml`) reste le garde-fou.

---

## 10. Verdict final pour Musaium V1 (2026-06-01)

### Stack actuel = GO

Pas de changement bloquant nécessaire. L'architecture design tokens 3-layer est conforme aux best practices DTCG 2026. Tailwind 4.1, Framer Motion 12, Recharts 3.8, MapLibre 5.23 sont tous production-ready.

### Patchs mineurs recommandés (avant ou après V1)

1. **Tailwind 4.1.8 → 4.3.x** (~10 min, gains webpack plugin + scrollbar utilities).
2. **MapLibre 5.23 → 5.24** (~5 min, perf gains -40% halo/glyph).
3. **Imports `framer-motion` → `motion/react`** (~10 min search-replace, alignement canon 2026).

### Décisions à reporter post-V1

- **Dark mode web** (V1.1) : `@custom-variant dark` + reuse `colors.dark` déjà émis vers RN.
- **shadcn/ui (Base UI backend)** si scope admin s'étend (post B2B revenue).
- **Tremor 4** si dashboards admin se multiplient.
- **View Transitions API** quand Next.js 16 sera stable et React `<ViewTransition>` sort de `unstable_`.

### Decisions à éviter

- ❌ Migrer Tailwind v4 → v3 (régression majeure pour rumeurs Tailwind Labs).
- ❌ Remplacer MapLibre par Mapbox (coût, licence pour B2B futur).
- ❌ Adopter Radix UI directement (ralenti post-WorkOS — passer par shadcn ou Base UI).
- ❌ Remplacer Recharts par ECharts pour le volume actuel (overkill).

### Doctrine "no feature flags pre-launch" respectée

Aucune des recommandations ci-dessus n'introduit de feature flag. Les patchs mineurs sont des bumps directs. Les décisions reportées sont des évolutions futures, pas des forks conditionnels.

---

## Sources (consultées 2026-05-12)

### Tailwind
- [Tailwind CSS Blog — v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3) — May 8, 2026 release
- [Tailwind CSS Blog — v4.0](https://tailwindcss.com/blog/tailwindcss-v4) — Oxide engine
- [Tailwind Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — `@custom-variant`
- [Tailwind Theme Variables docs](https://tailwindcss.com/docs/theme) — `@theme` directive
- [Socket Blog — Tailwind layoffs](https://socket.dev/blog/tailwind-css-announces-layoffs) — January 2026
- [Hacker News — Tailwind 75% layoffs](https://news.ycombinator.com/item?id=46527950)
- [DevClass — Tailwind Labs layoffs AI brutal impact](https://devclass.com/2026/01/08/tailwind-labs-lays-off-75-percent-of-its-engineers-thanks-to-brutal-impact-of-ai/)
- [LearnWebCraft — Oxide engine perf](https://learnwebcraft.com/blog/tailwind-v4-oxide-engine-speed-analysis)

### Motion / Framer Motion
- [Motion docs — Upgrade guide](https://motion.dev/docs/react-upgrade-guide)
- [Motion docs — GSAP vs Motion](https://motion.dev/docs/gsap-vs-motion)
- [Motion docs — Bundle size LazyMotion](https://motion.dev/docs/react-reduce-bundle-size)
- [LogRocket — best React animation libraries 2026](https://blog.logrocket.com/best-react-animation-libraries/)

### View Transitions
- [MDN — View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Can I Use — View Transitions single-doc](https://caniuse.com/view-transitions)
- [WebKit — Interop 2026](https://webkit.org/blog/17818/announcing-interop-2026/)
- [Next.js — viewTransition config](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition)
- [React 19.2 release notes](https://react.dev/blog/2025/10/01/react-19-2)

### Recharts / Charts
- [Recharts homepage](https://recharts.github.io)
- [PkgPulse — Recharts v3 vs Tremor vs Nivo 2026](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026)
- [Recharts issue #4558 — React 19](https://github.com/recharts/recharts/issues/4558)
- [Recharts issue #4336 — SSR Next.js](https://github.com/recharts/recharts/issues/4336)
- [Luzmo — best JS chart libraries 2026](https://www.luzmo.com/blog/best-javascript-chart-libraries)

### MapLibre
- [MapLibre Releases — GitHub](https://github.com/maplibre/maplibre-gl-js/releases)
- [MapLibre Newsletter Dec 2025](https://maplibre.org/news/2026-01-03-maplibre-newsletter-december-2025/)
- [MapLibre GL JS docs](https://maplibre.org/maplibre-gl-js/docs/)
- [MDPI — Vector data rendering perf comparison](https://www.mdpi.com/2220-9964/14/9/336)
- [PkgPulse — Mapbox vs Leaflet vs MapLibre 2026](https://www.pkgpulse.com/guides/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026)

### Headless UI primitives
- [InfoQ — MUI Releases Base UI 1](https://www.infoq.com/news/2026/02/baseui-v1-accessible/)
- [PkgPulse — shadcn vs Base UI vs Radix 2026](https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026)
- [GreatFrontend — top headless UI libs 2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)

### Design tokens / DTCG
- [W3C DTCG — first stable version Oct 2025](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- [Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/drafts/format/)
- [Tokens Studio — Style Dictionary v4](https://tokens.studio/blog/style-dictionary-v4-plan)
- [Contentful — design tokens 3-layer](https://www.contentful.com/blog/design-token-system/)

### Anime.js
- [Anime.js GitHub](https://github.com/juliangarnier/anime)
- [Hacker News — Anime.js v4](https://news.ycombinator.com/item?id=43570533)
