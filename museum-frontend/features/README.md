# `features/` — module layout reference

Each feature folder under `features/` is a vertical slice. The canonical shape is **hexagonal-light** with up to four sibling folders, matching the layering used in `auth/` and `chat/`:

| Folder | Role | Typical contents |
|---|---|---|
| `ui/` | React Native components, screens, styles. No business logic. | `*.tsx`, style modules, layout helpers |
| `application/` | Hooks, providers, orchestration. Glue between UI and infra. May include `*.pure.ts` helpers tested in isolation. | `useXxx.ts`, `XxxContext.tsx`, `xxxLogic.pure.ts` |
| `infrastructure/` | Side-effectful adapters: HTTP clients, Zustand stores (`AsyncStorage`/`SecureStore`), platform APIs. | `xxxApi.ts`, `xxxStore.ts`, native module bridges |
| `domain/` | Pure domain types and Zod contracts. No React, no I/O. | `contracts.ts`, `*.pure.ts` |

`domain/` is **optional** — only added when a feature has non-trivial value objects or Zod schemas worth isolating from `application/`.

Imports from outside the feature use the alias `@/features/<name>/<layer>/<file>`. Routing entry points (`app/(stack)/*.tsx` etc.) consume the feature through its barrel (`index.ts`) when one is exposed, otherwise direct imports against `ui/` / `application/`.

## Status per feature (verified 2026-05-12)

Verification method: `ls museum-frontend/features/<f>/` + spot-read of folder contents. Counts reflect `.ts`/`.tsx` only.

| Feature | Files | Layers present | Status | Notes |
|---|---:|---|---|---|
| `auth/` | 32 | ui · application · infrastructure · domain | Reference | Also has `screens/`, `routes.ts`, `useProtectedRoute.ts`, `index.ts` at the root — legacy entry points kept top-level for the Expo Router guard. |
| `chat/` | 80 | ui · application · infrastructure · domain | Reference | Largest feature. `application/sendStrategies/` and `infrastructure/chatApi/` are sub-modules, intentional. |
| `museum/` | 45 | ui · application · infrastructure | Conforming | No `domain/` — geo helpers (`haversine.ts`) live in `infrastructure/` next to MapLibre code. Acceptable; promote if a pure-domain cluster emerges. |
| `conversation/` | 9 | ui · application · infrastructure | Conforming | No `domain/` needed. |
| `daily-art/` | 4 | ui · application · infrastructure | Conforming | No `domain/` needed. |
| `review/` | 4 | ui · application · infrastructure | Conforming | No `domain/` needed. |
| `settings/` | 26 | ui · application · infrastructure (+4 top-level files) | Exception — accepted | `runtimeSettings.ts`, `runtimeSettings.pure.ts`, `dataModeStore.ts`, `voice-catalog.ts` are imported widely (≥10 callers across `app/` and other features). They predate the layering. Moving them is a large blast radius for zero behaviour gain — leave in place. New code MUST land under the correct `application/` or `infrastructure/` subfolder. |
| `onboarding/` | 7 | ui · application | Exception — accepted | Pure first-launch UX. No persistence of its own (it writes to `settings/infrastructure/userProfileStore`). `infrastructure/` would be empty. |
| `art-keywords/` | 5 | application · infrastructure · domain | Exception — accepted | Headless feature: runs as a background sync hook (`useArtKeywordsSync` mounted in `_layout.tsx`) and a classifier consumed by `chat/`. No screen of its own → no `ui/`. |
| `paywall/` | — | ui | Verified present | Soft-paywall stub V1 (C6). |
| `support/` | 2 | ui · infrastructure | Exception — accepted | One helper file + one API client. Adding `application/`/`domain/` to host two files would be ceremony, not architecture. |
| `home/` | 2 | ui | Exception — accepted | Two presentational components consumed by `app/(stack)/index.tsx`. UI-only by design. |
| `legal/` | 3 | ui (+2 top-level content files) | Exception — accepted | `privacyPolicyContent.ts` and `termsOfServiceContent.ts` are static text bundles excluded from coverage. Top-level placement matches their dumb-data nature. |
| `diagnostics/` | 3 | (flat) | Exception — accepted | `PerfOverlay.tsx`, `perfStore.ts`, `useFpsMeter.ts`. Debug-only surface, never shipped to production paths. Three files is below the threshold for layering. |

**Conforming (canonical or canonical-minus-domain)**: 6 — `auth`, `chat`, `museum`, `conversation`, `daily-art`, `review`.
**Accepted exceptions**: 8 — `settings` (size/imports), `onboarding` / `art-keywords` / `support` / `home` / `legal` / `diagnostics` / `paywall` (justified by domain or smallness).

## Rules for new features

1. Create at least `ui/` + `application/`. Add `infrastructure/` when the feature has I/O. Add `domain/` only when a pure-domain cluster (contracts, value objects) emerges.
2. No top-level `.ts`/`.tsx` files inside a feature folder unless: (a) `index.ts` barrel, (b) legacy compatibility shim being phased out, (c) the entire feature is ≤3 files (then flat is acceptable — see `diagnostics/`).
3. If a feature stays at ≤3 files but is **growing**, reshape into canonical folders before it crosses the threshold.
4. `screens/` is reserved for the `auth/` legacy split — do not introduce it in new features. Screens belong under `app/`; presentational pieces under `features/<name>/ui/`.

## Why not reshape the exceptions?

Audit P2-3 (2026-05-12) considered reshaping `art-keywords`, `home`, `legal`, `support`, `onboarding`, `diagnostics`, `settings`. Decision: none reshape. Reasons:

- `home`/`legal`/`support`/`diagnostics`: ≤3 files each — folders would mostly be empty.
- `art-keywords`: no UI surface (headless) — adding `ui/` would be a phantom folder.
- `onboarding`: no persistence — adding `infrastructure/` would be phantom.
- `settings`: top-level files have ≥10 import sites across the codebase. Renaming would touch `app/_layout.tsx`, multiple `features/chat/` files, multiple `features/settings/` files, and tests, for zero behaviour change. Cost > benefit pre-V1.

This exception list is the contract. New deviations require updating this table.
