# museum-frontend

Musaium mobile app — React Native 0.83 + Expo 55 + Expo Router. Visitor app: photograph an artwork or chat with the AI museum companion.

## Setup

```bash
npm install
cp .env.local.example .env       # then point EXPO_PUBLIC_API_BASE_URL at your backend
npm run dev                      # Expo dev server (Metro)
```

Backend must run on `http://localhost:3000` for the default `.env`. Start it from `museum-backend/` with `pnpm dev` (DB on port 5433 via `docker-compose.dev.yml`).

## Common scripts

| Script | What |
|---|---|
| `npm run dev` | Expo dev server (`EXPO_NO_TELEMETRY=1 expo start`) |
| `npm run ios` / `npm run android` | Native run on simulator/device |
| `npm run lint` | `eslint . --max-warnings=22 && tsc --noEmit` |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Node test runner (compiles to `.test-dist/`) + Jest RN suite |
| `npm run test:coverage` | Jest with coverage |
| `npm run generate:openapi-types` | Regenerate `shared/api/generated/openapi.ts` from backend OpenAPI spec |
| `npm run check:openapi-types` | Fail if generated types are stale |
| `npm run check:i18n` | i18n completeness check across 8 locales |

## Structure

```
app/                file-based routes (Expo Router)
  (tabs)/             home, conversations, museums
  (stack)/            chat, settings, onboarding, museum-detail, support, …
features/           one folder per bounded context (auth, chat, museum, review, …)
shared/             cross-feature: api/ (Axios + generated OpenAPI types), ui/, infra/, lib/
ios/ + android/     prebuilt native projects (Pods committed — no rebuild on Xcode Cloud)
```

Path alias: `@/*` → `./*`.

## App variants

`APP_VARIANT` (`development` | `preview` | `production`) selects bundle ID, app name, and `EXPO_PUBLIC_API_BASE_URL` via `app.config.ts`. EAS picks it up through `EAS_BUILD_PROFILE`.

## Tests & quality

Use shared factories from `tests/helpers/`. Never inline entity creation. Mocks live in `__tests__/test-utils.tsx`. See `docs/QUALITY_GUIDE.md`.

## More docs

- Architecture map — `docs/ARCHITECTURE_MAP.md`
- Internal testing flow — `../docs/MOBILE_INTERNAL_TESTING_FLOW.md`
- Store submission — `../docs/STORE_SUBMISSION_GUIDE.md`
- Voice pipeline — `../docs/AI_VOICE.md`
