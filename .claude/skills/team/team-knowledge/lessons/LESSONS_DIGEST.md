---
title: Lessons Digest — consolidated /team nuggets
kind: digest
consolidatedFrom:
  - 2026-05-05-f3-museumsheet-refactor
  - 2026-05-15-td2-bootstrap-profile-cross-device
  - 2026-05-15-td3-maplibre-self-hosted-style
  - 2026-05-15-td6-chaos-circuit-breaker-half-open
  - 2026-05-15-td8-cull-3-single-impl-chat-ports
note: >
  Aggressive cleanup of thin per-run lesson files. Source files git-rm'd by Tech Lead;
  full prose recoverable via git log. td4 (Docker hung), td9 (stale TD ticket / UFR-017),
  tanstack (multi-worktree contamination) dropped as dups of existing CLAUDE.md gotchas / memory.
---

# Lessons Digest

Terse, still-useful nuggets distilled from closed /team runs. One line each.

- **FE i18n hook arg** — when a hook only calls a formatter (e.g. `formatOpeningHours`), type its `t` param as the narrow `I18nTranslator` formatter contract, NOT i18next's broad `TFunction`; lets tests pass a plain `(key)=>key` without faking the full i18next surface. (2026-05-05, f3 MuseumSheet refactor)

- **`/auth/me` pref round-trip** — only `contentPreferences` round-trips with the backend; `runtimeSettings`/`dataMode`/`audioDescription` have NO `users` column, so cross-device bootstrap is FE-only until BE columns added (split TD-2 FE vs TD-2-BE). Verify entity columns + `/auth/me` shape before assuming a pref persists server-side. (2026-05-15, td2)

- **MapLibre CartoDB style** — CartoDB's *official* hosted style is `type: vector`; the online basemap we render is `raster`. Pointing the offline mirror at the official style would NOT fix the mismatch — self-host a raster style JSON instead (GH Pages mirror). (2026-05-15, td3)

- **Chaos circuit-breaker swap test** — for a test-only swap-proxy (fail-orchestrator → success-orchestrator), the post-swap orchestrator MUST share the SAME `LLMCircuitBreaker` instance as the failing one; a fresh breaker starts CLOSED and makes the HALF_OPEN test meaningless. Have the builder return `{ orchestrator, breaker }`. (2026-05-15, td6)

- **GitNexus interface blindspot** — `gitnexus_impact`/`context` return "Target not found" for TS interface/port names (the index doesn't track them by name); fall back to `grep` for blast radius on interface culls. (2026-05-15, td8)
