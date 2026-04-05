# Architecture Map

## Current Structure (April 2026)

### Routing — Expo Router (file-based)
- `app/_layout.tsx` — root layout
- `app/index.tsx` — redirect
- `app/auth.tsx` — auth screen
- `app/(tabs)/` — bottom tab navigator: `home`, `conversations`, `museums`
- `app/(stack)/` — stack screens: `chat/`, `settings`, `onboarding`, `discover`, `museum-detail`, `guided-museum-mode`, `preferences`, `privacy`, `terms`, `support`, `tickets`, `ticket-detail`, `create-ticket`, `change-password`

### Features — Hexagonal by domain
Each feature follows the pattern: `domain/` + `application/` + `infrastructure/` + `ui/`

| Feature | Contents |
|---------|----------|
| `features/auth/` | Login/register, token storage, protected route hook, `routes.ts` |
| `features/chat/` | Chat session, messages, LLM interaction |
| `features/conversation/` | Conversation list, dashboard |
| `features/daily-art/` | Daily artwork suggestion |
| `features/legal/` | Privacy policy, terms of service content |
| `features/museum/` | Museum directory, museum detail |
| `features/onboarding/` | Onboarding carousel |
| `features/settings/` | Runtime settings, preferences |
| `features/support/` | Support tickets |

### Shared — Cross-feature utilities
- `shared/api/` — Axios-based OpenAPI client (`httpRequest.ts`, `openapiClient.ts`), auto-generated types (`generated/openapi.ts`)
- `shared/infrastructure/` — `httpClient.ts` (Axios instance + interceptors), `storage.ts` (AsyncStorage adapter), `apiConfig.ts` (env-driven API base URL), `httpErrorMapper.ts`, `requestId.ts`, `connectivity/`, `inAppReview.ts`
- `shared/ui/` — Reusable components: `ErrorNotice`, `ErrorBoundary`, `FormInput`, `GlassCard`, `LiquidScreen`, `BrandMark`, `FloatingContextMenu`, skeletons, theme system (`ThemeContext`, `themes.ts`, `tokens.generated.ts`)
- `shared/lib/` — `errors.ts` (AppError union, guards)
- `shared/config/` — App configuration
- `shared/i18n/` — Internationalization setup
- `shared/locales/` — Translation files
- `shared/observability/` — Sentry + telemetry
- `shared/types/` — Shared TypeScript types

## Data Flow

UI (Expo Router screen) -> feature hook -> application use-case -> repository/adapter (implements port) -> `shared/infrastructure/httpClient` (Axios) -> API.

Persistent client state (tokens) uses `shared/infrastructure/storage` (expo-secure-store). Domain objects are created before reaching UI.

## Placement Rules

- **API calls**: only in `infrastructure/` adapters, never directly in UI or domain.
- **Models/validation**: DTO parsing in `shared/types/` or feature `domain/`; convert DTO -> domain entities near the boundary.
- **Formatting**: date/string formatting in `shared/lib/` for reuse; UI consumes formatted values.
- **Routing constants**: `features/<feature>/routes.ts` to avoid string duplication.
- **API types**: auto-generated from backend OpenAPI spec via `npm run generate:openapi-types`.
