# Musaium Backend

Express 5 + TypeORM backend for Musaium (mobile-first API).

## API Surface

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (DB, Redis, LLM circuit breaker) |

### Auth (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login (email + password) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (revoke refresh token) |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/social-login` | Social login (Google/Apple ID token) |
| DELETE | `/api/auth/account` | Delete own account (GDPR) |
| GET | `/api/auth/export-data` | Export own data (GDPR) |
| PUT | `/api/auth/change-password` | Change password |
| PUT | `/api/auth/change-email` | Request email change |
| POST | `/api/auth/confirm-email-change` | Confirm email change via token |
| POST | `/api/auth/forgot-password` | Request password reset email |
| POST | `/api/auth/reset-password` | Reset password via token |
| POST | `/api/auth/verify-email` | Verify email via token |
| PATCH | `/api/auth/onboarding-complete` | Mark onboarding as completed |
| POST | `/api/auth/api-keys` | Create API key (feature-flagged, B2B) |
| GET | `/api/auth/api-keys` | List API keys (feature-flagged, B2B) |
| DELETE | `/api/auth/api-keys/:id` | Revoke API key (feature-flagged, B2B) |

### Chat — Sessions (`/api/chat`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/sessions` | Create a new chat session |
| GET | `/api/chat/sessions` | List user's sessions (paginated) |
| GET | `/api/chat/sessions/:id` | Get session with paginated messages |
| DELETE | `/api/chat/sessions/:id` | Delete an empty session |

### Chat — Messages (`/api/chat`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/sessions/:id/messages` | Send a message (text + optional image upload) |
| POST | `/api/chat/sessions/:id/messages/stream` | Send a message with SSE streaming response |
| GET | `/api/chat/art-keywords` | List art keywords by locale (offline sync) |
| POST | `/api/chat/art-keywords` | Bulk upsert art keywords |

### Chat — Media (`/api/chat`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/sessions/:id/audio` | Send an audio message (transcription + LLM) |
| POST | `/api/chat/messages/:messageId/report` | Report a message |
| POST | `/api/chat/messages/:messageId/feedback` | Submit feedback (thumbs up/down) |
| POST | `/api/chat/messages/:messageId/image-url` | Get signed image URL for a message |
| POST | `/api/chat/messages/:messageId/tts` | Text-to-speech for a message (feature-flagged) |
| GET | `/api/chat/messages/:messageId/image` | Serve message image (signed URL verification) |

### Chat — Memory (`/api/chat`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat/memory/preference` | Get memory opt-out preference |
| PATCH | `/api/chat/memory/preference` | Toggle memory opt-out |

### Chat — Describe (`/api/chat`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/describe` | Describe artwork from image/text (multi-format output) |

### Museums (`/api/museums`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/museums/directory` | Public directory of active museums |
| GET | `/api/museums/search` | Search museums by geo/text query |
| POST | `/api/museums` | Create a museum (admin only) |
| GET | `/api/museums` | List all museums (admin/moderator/manager) |
| GET | `/api/museums/:idOrSlug` | Get museum by ID or slug |
| PUT | `/api/museums/:id` | Update museum (admin only) |
| GET | `/api/museums/:id/low-data-pack` | Get low-data offline pack for a museum |

### Daily Art (`/api/daily-art`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/daily-art` | Get today's artwork (deterministic rotation) |

### Reviews (`/api/reviews`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reviews` | Create a review (authenticated) |
| GET | `/api/reviews` | List approved reviews (public, paginated) |
| GET | `/api/reviews/stats` | Get average rating + count (public) |

### Support (`/api/support`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/support/contact` | Public contact form submission |
| POST | `/api/support/tickets` | Create a support ticket (authenticated) |
| GET | `/api/support/tickets` | List own tickets (authenticated, paginated) |
| GET | `/api/support/tickets/:id` | Get ticket detail (ownership check) |
| POST | `/api/support/tickets/:id/messages` | Add message to ticket |

### Admin (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | Paginated user list |
| PATCH | `/api/admin/users/:id/role` | Change user role |
| GET | `/api/admin/audit-logs` | Paginated audit logs |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/reports` | Paginated report list |
| PATCH | `/api/admin/reports/:id` | Resolve a report |
| GET | `/api/admin/analytics/usage` | Usage time-series analytics |
| GET | `/api/admin/analytics/content` | Content analytics |
| GET | `/api/admin/analytics/engagement` | Engagement analytics |
| GET | `/api/admin/tickets` | Paginated ticket list (all users) |
| PATCH | `/api/admin/tickets/:id` | Update ticket status/priority/assignment |
| GET | `/api/admin/reviews` | Paginated review list (filterable by status) |
| PATCH | `/api/admin/reviews/:id` | Moderate a review (approve/reject) |
| POST | `/api/admin/museums/:id/cache/purge` | Purge LLM cache for a museum |

## Architecture Snapshot

- Auth: `JWT-only` (access + refresh rotation)
- Chat: session/message persistence with TypeORM + PostgreSQL
- Media: image upload + signed image URLs for history rendering
- Knowledge extraction: scrape, classify, store pipeline (BullMQ)
- Contracts: active OpenAPI spec in `openapi/openapi.json`
- Swagger UI: `/api/docs` (loads the versioned OpenAPI spec)

## Prerequisites

- Node.js 22+
- `pnpm` 9.x
- PostgreSQL 16+
- Docker (recommended for e2e tests)

## Environment Setup

Use environment-specific templates:

```bash
cp .env.local.example .env        # local dev
# or
cp .env.staging.example .env      # preprod/staging
# or
cp .env.production.example .env   # production
```

Legacy convenience file `./.env.example` still exists, but prefer the environment-specific templates.

## Install

```bash
pnpm install --frozen-lockfile
```

## Run (Local)

```bash
pnpm run dev
```

## Quality Checks

```bash
pnpm run lint
pnpm run typecheck
pnpm test
```

## E2E (Postgres + Docker)

```bash
RUN_E2E=true pnpm test -- --watchman=false --runInBand tests/e2e/api.postgres.e2e.test.ts
```

## Migrations

```bash
pnpm run migration:show
pnpm run migration:run
pnpm run migration:revert
```

Create/generate migrations:

```bash
node scripts/migration-cli.cjs generate --name=MigrationName
```

## OpenAPI / Swagger

- Source of truth: `openapi/openapi.json`
- Swagger UI: `GET /api/docs`

## Deployment

Use the guided runbook:

- `docs/OPS_DEPLOYMENT.md`

This includes:

- local/preprod/prod env setup
- backend GHCR/VPS Docker deploy : 2 years token
- migrations
- staging/prod smoke tests
- EAS mobile preview/prod build and submission
- rollback and incident runbook

## Troubleshooting

### Dev image rebuild after 2026-04-12

Le `Dockerfile.dev` a ete aligne sur pnpm 9 (avant : pnpm 8). Si tu avais une image Docker cachee avant 2026-04-12, tu verras `Lockfile is incompatible` au demarrage. Fix :

```bash
docker compose -f docker-compose.dev.yml build --no-cache backend
```
