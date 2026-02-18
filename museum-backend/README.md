# museum-ia backend

Express 5 + TypeORM backend for MuseumIA.

## Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm (or pnpm if you prefer)

## Setup

```bash
cp .env.example .env
pnpm install
```

Update `.env` with database and LLM credentials.

For local Postgres without credentials, keep `DB_USER=` and `DB_PASSWORD=` empty.
Use `DB_PORT=5432` for native local Postgres, or `DB_PORT=5433` for the bundled docker-compose DB.
Set `DB_SYNCHRONIZE=false` to keep schema changes under migration control.

Note: this backend uses a `pnpm-lock.yaml`. Running `npm install` on an existing pnpm-managed `node_modules` can fail; prefer `pnpm install`.

## Run

```bash
npm run dev
```

Server endpoints:

- `GET /api/health`
- `POST /api/chat/sessions`
- `POST /api/chat/sessions/:id/messages`
- `GET /api/chat/sessions/:id`
- Legacy endpoints under `/api/v1/*`

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
```

## TypeORM migration commands

Migration workflow is enabled and intended for development/production parity.

```bash
npm run migration:new -- --name=CreateChatSessionTable
npm run migration:create -- --name=ManualFixForSessionIndexes
npm run migration:show
npm run migration:run
npm run migration:revert
```

## Local docker stack

```bash
docker compose -f docker-compose.dev.yml up --build
```
