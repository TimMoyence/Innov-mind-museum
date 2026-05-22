# Lessons — react-dom (family : react + react-dom v19.2.6)

react-dom shares the **react** family. Project gotchas live primarily in [`../react/LESSONS.md`](../react/LESSONS.md). Only react-dom-SPECIFIC findings go here.

## 2026-05-20 — react-dom surface confirmé inutilisé directement (defense baseline)
- **Scan 2026-05-21** (`museum-frontend/{app,features,shared,components}` + `museum-web/src`) :
  - ✅ Zero `createRoot` / `hydrateRoot` custom — Expo (FE) et Next.js (web) possèdent le bootstrap. Ne PAS introduire d'appel manuel.
  - ✅ Zero `flushSync` — garder à zéro (bypass concurrent rendering).
  - ✅ Zero `createPortal` — les overlays FE passent par `<Modal>` RN + `bottomSheetStore`, pas par des portals DOM.
  - ✅ Zero appel direct aux resource hints (`preconnect`/`preload`/`preinit`/…) — Next.js gère le chargement ressources. Les ajouter manuellement = double-fetch potentiel.
- **Implication** : toute apparition de ces APIs en review = signal fort à challenger (Next.js/Expo le fait déjà, ou il y a un anti-pattern).

## 2026-05-20 — Hydration : surface museum-web uniquement
- museum-frontend (Expo / React Native) n'a PAS d'hydration HTML → les pièges d'hydration ne s'y appliquent pas.
- museum-web (Next.js 15) hydrate : interdire `Date.now()`/`Math.random()`/branche `typeof window`/date locale-dépendante dans le render hydraté. v19 = un seul diff consolidé (pas de spam). Voir `../react/PATTERNS.md:§5`.
- Pattern correct in-repo : `useSearchParams` enveloppé dans `<Suspense>` (`ResetPasswordForm.tsx:161`, `EmailTokenFlow.tsx:174`) — requis Next 15.
