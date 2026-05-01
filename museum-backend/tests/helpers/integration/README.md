# Integration Test Harness

`createIntegrationHarness()` boots a Postgres testcontainer (one per Jest worker), runs all TypeORM migrations, and returns a handle for integration tests.

Use this harness for ADR-012 integration tests — tests that cross the DB boundary but do NOT spin up the full Express app + middleware chain.

## Pattern A — service / use-case direct

```ts
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { buildChatService } from '@modules/chat';

describe('chat-service-pagination [integration]', () => {
  let harness;
  let service;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    service = buildChatService(harness.dataSource);
  });

  beforeEach(() => harness.reset());

  it('paginates messages correctly', async () => { /* ... */ });
});
```

## Pattern B — route mount on bare Express app

```ts
import express from 'express';
import request from 'supertest';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { mountAuthRoutes } from '@modules/auth';

describe('auth.route [integration]', () => {
  let harness;
  let app;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    app = express().use(express.json());
    mountAuthRoutes(app); // module reads AppDataSource → already bound to container
  });

  beforeEach(() => harness.reset());

  it('POST /api/auth/register → 201', async () => { /* ... */ });
});
```

## When NOT to use this harness

- Pure-function logic — use `tests/unit/` instead.
- Full-stack flow including LangChain, Sentry, rate-limit middleware, BullMQ — use `tests/e2e/` and `createE2EHarness()`.

## Container strategy

- One container per Jest worker, reused across suites in that worker.
- `reset()` runs `TRUNCATE … RESTART IDENTITY CASCADE` on every entity table — single round-trip, ~5ms.
- Migrations run once per worker on first `createIntegrationHarness()` call.

## Running integration tests

Integration tests are gated by `RUN_INTEGRATION=true` (set automatically by the script):

```bash
pnpm test:integration                                          # full integration suite
pnpm test:integration -- --testPathPattern=<file basename>     # single file
```

`pnpm test` (no suffix) runs **only** the unit suite, regardless of how many integration files exist. This is intentional — integration tests require Docker and are slower.
