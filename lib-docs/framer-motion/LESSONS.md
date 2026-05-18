# Lessons — framer-motion → motion (v12.38.0)

Audit 2026-05-18 : **CHANGES_REQUESTED** — package renamed mid-2025.

## 🚨 F1 MAJOR : ALL 11 importers use legacy `from 'framer-motion'` instead of `from 'motion/react'`
- **Cause** : PATTERNS §1 + §6 'New code MUST use motion/react'. Package npm renamed `framer-motion` → `motion`. Currently masked by legacy alias support.
- **Sites** (11) : `Header.tsx:3`, `StorySection.tsx:7`, `HeroOrbs.tsx:3`, `AnimatedSection.tsx:4`, `ScrollProgress.tsx:3`, `DemoChat.tsx:4`, `FAQSection.tsx:4`, `AnimatedLine.tsx:4`, `PhoneMockup.tsx:3`, `BentoFeatureGrid.tsx:4`, `HeroAnimation.tsx:3`.
- **Fix TD-FM-01** : Codemod 11 files `from 'framer-motion'` → `from 'motion/react'`. `pnpm remove framer-motion && pnpm add motion`. Verify SSR — Next.js 15 server components import `motion/react-client`. ~30min including pnpm lockfile + smoke build.

## ⚠️ F2 MINOR : Next.js 15 RSC boundary unverified per file
- Each file devrait commencer par `'use client'` directive (motion hooks require client). Audit window did not check all 11 files.
- **Fix** : verify 'use client' on each file (low risk — Next.js will error at build if violation).

## ✅ Positives
- **`useReducedMotion`** consumed in 7/11 animated files (HeroOrbs, ScrollProgress, AnimatedSection, DemoChat, AnimatedLine, HeroAnimation, FAQSection) — matches PATTERNS accessibility guidance
- `globals.css:364` includes `@media (prefers-reduced-motion: reduce)` — defense-in-depth alongside JS hook
- `AnimatePresence` used in FAQSection (idiomatic collapsible)
- `useScroll + useTransform + useMotionValueEvent` composition correct
