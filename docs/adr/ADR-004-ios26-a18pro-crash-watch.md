# ADR-004 — iOS 26 / A18 Pro production crash watch

- **Status**: Active monitoring (2026-04-20)
- **Owner**: Mobile

## Context

Production EAS builds crash on launch on **Apple A18 Pro devices (iPhone 16 / 16 Pro / 16 Pro Max) running iOS 26.x**, while dev builds on the same devices with the same code work correctly. Upstream issue: [github.com/expo/expo#44680](https://github.com/expo/expo/issues/44680) (confirmed via websearch 2026-04-20). Not a code bug in InnovMind — it is an Expo SDK 55 / 56 interaction with the A18 Pro chipset.

Observed signature: `TurboModule void method throws NSException → @throw exception rethrows → uncaught on GCD queue → std::__terminate → abort()`, producing `EXC_CRASH / SIGABRT` at launch.

## Decision

Until Expo publishes a fix:

1. **Monitor upstream issue** weekly. Owner: whoever touches mobile next.
2. **TestFlight gate**: before any App Store submission targeting iOS 26 devices, verify on a real A18 Pro (iPhone 16 series) via TestFlight. Do not ship to production without this gate green.
3. **If upstream does not ship a fix within 4 weeks of next planned release**, evaluate in order:
   1. Downgrade to Expo SDK 54 (non-ideal — loses SDK 55 improvements).
   2. Eject to React Native bare workflow at 0.82 to regain control over TurboModule handling.
   3. Rollback last prebuild step if crash is linked to a specific native change.
4. **Keep the existing iOS diagnostics** (uncaught exception handler, Sentry 8.7.0) — these are the only signal currently.

## Rejected alternatives

- **Remove all TurboModules** — not feasible, expo-modules-core depends on them.
- **Patch `expo-modules-core` locally** — fragile, re-applies after every `expo prebuild --clean`.
- **Ship without verification** — unacceptable for paid users on flagship hardware.

## Consequences

### Positive
- Explicit production gate.
- Clear escalation path.

### Negative
- Blocks fast iteration on iOS 26.

### Reversibility
- Fully reversible — drop the gate when upstream fix lands.

## Related
- Memory: `project_ios26_crash_investigation.md` — dual crash investigation ongoing.
- ADR-001 (SSE deprecated) — tangentially related (chat-message.route.ts surface).

## Links

- [expo/expo#44680](https://github.com/expo/expo/issues/44680)
- [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- Audit enterprise-grade 2026-04-20 : `/Users/Tim/.claude/plans/generic-squishing-manatee.md` (Phase 7)
