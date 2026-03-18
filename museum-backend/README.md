# Musaium Backend

Express 5 + TypeORM backend for Musaium (mobile-first API).

Current active backend surface:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:id`
- `DELETE /api/chat/sessions/:id`
- `POST /api/chat/sessions/:id/messages`
- `POST /api/chat/sessions/:id/audio`
- `POST /api/chat/messages/:messageId/image-url`
- `GET /api/chat/messages/:messageId/image`

## Architecture Snapshot

- Auth: `JWT-only` (access + refresh rotation)
- Chat: session/message persistence with TypeORM + PostgreSQL
- Media: image upload + signed image URLs for history rendering
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
pnpm run migration:create -- --name=ManualChange
pnpm run migration:generate -- --name=DescribeChange
```

## OpenAPI / Swagger

- Source of truth: `openapi/openapi.json`
- Swagger UI: `GET /api/docs`

## Deployment

Use the guided runbook:

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/DEPLOYMENT_STEP_BY_STEP.md`

This includes:

- local/preprod/prod env setup
- backend GHCR/VPS Docker deploy : 2 years token
- migrations
- staging/prod smoke tests
- EAS mobile preview/prod build and submission
- rollback and incident runbook
