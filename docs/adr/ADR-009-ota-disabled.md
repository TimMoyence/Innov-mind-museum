# ADR-009 — OTA (expo-updates) disabled by design

- **Status:** Accepted
- **Date:** 2026-04-24
- **Deciders:** Product + Mobile
- **Supersedes:** N/A

## Context

`museum-frontend/app.config.ts:318-323` sets:

```ts
updates: {
  enabled: false,
  checkAutomatically: 'NEVER',
  fallbackToCacheTimeout: 0,
  ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
}
```

The 2026-04-24 enterprise audit flagged this as "minor drift — intent unclear": OTA infrastructure (channel URL, project ID, EAS Update channels in `eas.json`) is configured but runtime fetching is disabled.

The product owner confirmed the setting is **intentional**.

## Decision

Ship the app **without runtime OTA updates**. Reasons:

1. **Native module footprint** — Musaium ships new native modules regularly (MapLibre, expo-audio, expo-local-authentication, expo-secure-store, Sentry). OTA JS-only updates would drift from native binaries; partial OTA fixes can mask native regressions.
2. **Review consistency** — App Store and Google Play review covers a specific bundle. OTA bypasses that boundary; keeping every update behind store review preserves compliance clarity (important for a public museum-facing product with children in audience).
3. **Crash attribution** — Sentry release tagging + the store-built binary give us one-to-one release traceability. OTA layers introduce runtime-version vs native-build mismatches that complicate debugging.
4. **Low deploy frequency** — current cadence is measured in weeks, not hours. The latency gain of OTA is not worth the complexity.

The project ID and channel URL are kept in `app.config.ts` so EAS Build metadata remains valid and so OTA can be re-enabled later with a single flag flip, without reconfiguring infra.

## Consequences

- All app updates go through App Store Connect / Google Play Console. No hotfix path shorter than store review.
- `expo-updates` package is installed (required by Expo SDK 55) but never fetches.
- `eas.json` channels (`development`, `preview`, `internal`, `production`) remain declared but unused at runtime.
- If a P0 regression ships, the recovery path is: revert the PR, rebuild through EAS, submit an expedited review (documented in `docs/MOBILE_INTERNAL_TESTING_FLOW.md`).

## Revisit triggers

Re-evaluate this decision when any of the following is true:

- A P0 regression escapes to production and EAS+store review latency causes user harm.
- We need A/B or staged percentage rollouts that store review does not support.
- Expo releases changes to OTA (e.g. signed updates, native-module fingerprinting) that materially reduce the OTA/native drift risk.

## Related

- `museum-frontend/app.config.ts:318-323` — runtime flag.
- `museum-frontend/eas.json` — channel declarations (kept for EAS metadata).
- `docs/MOBILE_INTERNAL_TESTING_FLOW.md` — current release path.
