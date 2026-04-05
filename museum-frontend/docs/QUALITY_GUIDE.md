# Quality Guide

## Principles
- **KISS first**: prefer the smallest change that solves the problem; no premature abstractions.
- **Pragmatic SOLID**: single responsibility per module; explicit interfaces at feature boundaries; inject infrastructure via function params when it keeps tests simple.
- **Light DDD**: keep business rules in `domain`, orchestration in `application`, IO in `infrastructure`, and rendering in `ui`. Domain never imports React Native, Expo, axios, or AsyncStorage.
- **Type safety**: explicit return types for public functions/use-cases; avoid `any`; prefer `unknown` plus narrowing at IO edges.

## Naming
- Components: `PascalCase`, file matches component (e.g., `HomeScreen.tsx`).
- Hooks: `useCamelCase`, colocate with feature under `hooks/`.
- Types & DTOs: `PascalCase` ending with `DTO` for transport, `Props` for components, `Request/Response` for service inputs/outputs.
- Route constants: exported `CONST_CASE` in `features/<feature>/routes.ts`.
- Folders: `kebab-case` except `app/` (expo-router rules) and `ui` components which stay `PascalCase` files.

## Error Handling Pattern
- Normalize external errors to `AppError` union: `Network`, `Unauthorized`, `Forbidden`, `Validation`, `NotFound`, `Unknown`.
- Map axios/fetch errors in `shared/infrastructure/httpClient.ts` and expose helpers to UI.
- UI shows friendly text, logs tech detail in dev only; never swallow errors silently.
- AsyncStorage or permission errors surface as `Unknown` with context.

## File & Folder Conventions (expo-router)
- `app/_layout.tsx` sets providers and guards; keeps render-only composition.
- `app/index.tsx` minimal redirect or landing logic only.
- Grouped routes like `(tabs)/` hold tab screens; each screen stays presentational and delegates to feature hooks/use-cases.
- Shared primitives live in `shared/ui`; avoid importing feature code from `shared`.

## How To Add A New Feature (checklist)
1) Create `features/<feature>/domain` types/entities and pure functions.
2) Add `features/<feature>/application` use-cases orchestrating domain + ports.
3) Implement ports in `features/<feature>/infrastructure` (axios adapters, storage) using `shared/infrastructure/httpClient`.
4) Build UI under `features/<feature>/ui` and connect via hooks that call application layer.
5) Define routes in `features/<feature>/routes.ts`; register screens under `app/`.
6) Add error mapping for new endpoints, update `shared/types` if new DTOs.
7) Run `expo lint` and manual smoke test on device (auth, navigation, critical happy path).
