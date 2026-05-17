# Changelog

All notable changes to `@musaium/shared` will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-05-16

### Removed
- `./geo`, `./auth`, `./errors`, `./i18n`, `./validation` sub-package exports
  (phantom — 0 consumer in museum-backend, museum-frontend, museum-web — UFR-016
  bury_dead_code, audit-360 S1 § 5.3, task T1.5 path (a) cull).
- Source dirs `src/{geo,auth,errors,i18n,validation}/` deleted.

### Kept
- `./observability` (sentry-scrubber primitives + types — 3 live consumers:
  museum-backend `src/shared/observability/sentry-scrubber.ts` via root barrel,
  museum-frontend `shared/observability/sentry-scrubber.ts` via path-style,
  museum-web `src/lib/sentry-scrubber.ts` via path-style).

### Changed
- `package.json` `description` narrowed to reflect observability-only surface.
- `package.json` `exports` map trimmed to `.` + `./observability`.

## [0.1.0] — 2026-05-12

### Added
- Initial scaffold (sprint cleanup-2026-05-12, agent C) with sub-packages
  `geo`, `validation`, `i18n`, `errors`, `auth`, `observability`.
