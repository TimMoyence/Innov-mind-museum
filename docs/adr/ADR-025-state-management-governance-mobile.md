# ADR-025 — State Management Governance (museum-frontend)

**Date:** 2026-05-01
**Status:** Accepted
**Context:** Spec A — Cleanup & Decisions (see git log (spec deleted 2026-05-03))

## Context

`museum-frontend` mixes three state-management approaches without a documented rule:
- **Zustand** with `persist` middleware — 8 stores including `runtimeSettingsStore`, `userProfileStore`, `chatLocalCache`, `artKeywordsStore`, `conversationsStore`, `chatSessionStore`, `dataModeStore`.
- **TanStack React Query** — introduced via the enterprise auth refactor (commit `3d8658a8`).
- **Ad-hoc `useState`** — including `auth.tsx` which historically held 8+ `useState` calls for form fields, mode toggle, password visibility, and submit state.

Without a rule, the team forks tools at every feature, increasing review overhead and producing duplicated cache layers (e.g. local message cache + remote conversation list cached by both Zustand and React Query).

## Decision

Each piece of state is classified into one of four buckets and the corresponding tool is mandatory.

| Class | Tool | Examples |
|---|---|---|
| Persistent client state | Zustand + `persist` middleware | `runtimeSettingsStore`, `userProfileStore`, `chatLocalCache`, `artKeywordsStore`, `conversationsStore`, `chatSessionStore`, `dataModeStore` |
| Server state (remote) | TanStack React Query | museum directory list, museum detail, conversations remote pagination, daily-art catalog |
| Ephemeral UI state | `useState` / `useReducer` | modal open/close, focus ring, password-visibility toggle |
| Form state (≥3 fields or with validation) | `react-hook-form` (+ `@hookform/resolvers/zod`) | `auth.tsx` (T3.3 of Spec A), support ticket form, review submission form |

### Decision rules

- Persists across app restart? → Zustand persist.
- Comes from API and can be invalidated? → React Query.
- Lives only inside one screen and resets each mount? → `useState` / `useReducer`.
- Multi-field with validation rules? → React Hook Form.

## Consequences

- New PRs introducing fresh `useState` chains for forms (≥3 fields) or fresh local caches for server-state data should be rejected in review and rerouted to the appropriate tool.
- Existing offenders are migrated incrementally, starting with `auth.tsx` in this same spec (T3.3). Other migrations follow as the surrounding feature is touched, not as bulk refactor.
- TanStack Query Devtools stay opt-in via the dev build only.
- `react-hook-form` + `@hookform/resolvers` + `zod` will be added as new dependencies in T3.2 (Spec A).

## Alternatives Considered

- **Redux Toolkit** — heavier than the project needs; no current adopters; the persistence story would be re-invented.
- **Jotai** — atomic state would compete with Zustand without a clear win and there is no migration story for `persist`.
- **Continue ad-hoc** — rejected; produces drift and silent duplication of cache layers.
- **Place this ADR under `museum-frontend/docs/adr/`** (per-app) — rejected to keep all repo ADRs in a single discoverable directory; existing convention places architecture decisions at `docs/adr/` regardless of which app they affect.

## Related

- Plan: see git log (plan deleted 2026-05-03) Task 3.1
- Spec: see git log (spec deleted 2026-05-03) Section 3
