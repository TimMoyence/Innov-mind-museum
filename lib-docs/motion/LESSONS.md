# Lessons — motion (formerly framer-motion) — museum-web

Human-edited project gotchas. Newest section on top.

## 2026-05-20

Audit re-run on `motion@^12.39.0` (museum-web, Next 15 / React 19). Verdict: **APPROVED with follow-ups** (a11y gaps, not blockers).

### TD-30 import migration — COMPLETE
- All 11 importers use `import … from 'motion/react'`. Zero residual `from 'framer-motion'` (grep `museum-web/src` 2026-05-21).
- `package.json:31` declares `motion@^12.39.0`. The dir was renamed `framer-motion/` → `motion/` in lib-docs to match.
- All 11 files start with `'use client';` (grep verified) — RSC boundary correct.

### A11y gap (F1, MAJOR follow-up) — 4 animated files lack a reduced-motion guard
- **`Header.tsx`** — `useScroll` + `useTransform` (bg/border/blur) with NO `useReducedMotion`. Scroll-driven transform runs even when user requests reduced motion.
- **`PhoneMockup.tsx`** — `useScroll`/`useTransform` parallax (`y`), NO `useReducedMotion`. Parallax is exactly the case the docs say to disable (motion sickness).
- **`StorySection.tsx`** — multiple `whileInView` transform+scale reveals, NO `useReducedMotion`.
- **`BentoFeatureGrid.tsx`** — `whileInView` variant with `y`/`scale`, NO `useReducedMotion`.
- **Fix TD-FM-02**: either add `<MotionConfig reducedMotion="user">` near the web layout root (blanket fix, cheapest — auto-disables transform+layout, keeps opacity) OR add `useReducedMotion()` short-circuits per file. PATTERNS § 3 / § 4. The CSS `@media (prefers-reduced-motion)` block (`globals.css:364`) does NOT cover JS-driven `useTransform`/`whileInView` values.

### A11y positives
- 6/11 files DO consume `useReducedMotion` (HeroOrbs, ScrollProgress, AnimatedSection, DemoChat, AnimatedLine, HeroAnimation) — matches PATTERNS guidance.
- `globals.css:364` `@media (prefers-reduced-motion: reduce)` defense-in-depth for CSS transitions.

### Array-index keys (F2, MINOR)
- `BentoFeatureGrid.tsx:36` `key={i}` on `whileInView` variant children. Stable for a static feature list (no reorder) so currently harmless, but violates PATTERNS § 4. Use a stable `feature.title`/id key.

### Bundle (F3, INFO — not a defect)
- No `LazyMotion`/`m.*` usage anywhere (grep). Acceptable while landing motion bundle is small. Revisit if Lighthouse JS/TBT budget regresses (PATTERNS § 5). Adopt repo-wide or not at all — a stray `motion.*` defeats it.

### No breaking / security
- v11 → v12 has no breaking React-API change. 13.0.0-alpha exists — do NOT adopt. No security advisories for the package family (gh empty, 2026-05-21).
- Stay ≥ 12.37.0 for the `whileInView` client-nav + `useScroll` hydration fixes (we are on 12.39.0).
