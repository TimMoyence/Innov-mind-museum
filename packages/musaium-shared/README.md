# @musaium/shared

Cross-app shared utilities for the Musaium monorepo.

**Status**: package scaffold ready; **not yet wired** into the three apps.

## Contents (sprint cleanup-2026-05-12, agent C)

| Subpath | Exports | Notes |
| --- | --- | --- |
| `./geo` | `haversineDistanceMeters` | Currently duplicated in `museum-backend/src/shared/utils/haversine.ts` + `museum-frontend/features/museum/application/haversine.ts`. |
| `./validation` | `PASSWORD_MIN`, `PASSWORD_MAX`, `passwordSchema` | Replaces 5 ad-hoc Zod password schemas across BE schemas + Web admin + RN. |
| `./i18n` | `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE`, `isSupportedLocale` | Web `[locale]` route param narrowing currently uses `as Locale`. |
| `./errors` | `ERROR_CODES`, `ErrorCode` | Single source of truth for error code literals shared between BE envelopes and FE/Web mappers. |
| `./auth` | `decodeJwtPayloadWith`, `jwtHeaderSchema`, `baseJwtPayloadSchema`, `Base64UrlDecoder` | Isomorphic helper — host provides Node `Buffer`-or-browser `atob` decoder. Replaces the per-app `jwt-decode.ts` files added in C.12. |

## Why "not yet wired"

Wiring requires touching the root `pnpm-workspace.yaml` and every consumer
`package.json` — high coordination cost during the parallel-worktree sprint
cleanup-2026-05-12. The scaffold lets the next sprint integrate one consumer at
a time without re-discovering the API surface.

## Integration plan (next sprint)

1. Add `pnpm-workspace.yaml` at repo root:
   ```yaml
   packages:
     - museum-backend
     - museum-web
     - packages/*
   ```
   museum-frontend (Expo) cannot join the pnpm workspace; consume via
   `npm install file:../packages/musaium-shared`.

2. Add `"@musaium/shared": "workspace:*"` to museum-backend and museum-web
   dependencies. Run `pnpm install` at the root.

3. Replace consumers one subpath at a time:
   - `import { haversineDistanceMeters } from '@musaium/shared/geo'`
   - delete `museum-backend/src/shared/utils/haversine.ts` + FE counterpart.
   - Same for password / locales / error codes.

4. JWT decode: keep the per-app wrappers (`src/shared/auth/jwt-decode.ts`) but
   replace their bodies with a call to `decodeJwtPayloadWith(token, schema, base64UrlDecoder)`
   so the parsing/validation logic lives in one place.

## Sentry scrubbers — explicitly NOT here

Per the audit doctrine, the 3-copy Sentry scrubber pattern stays manual for this
sprint. Extraction to `@musaium/shared/observability` is deferred to ADR-045.
