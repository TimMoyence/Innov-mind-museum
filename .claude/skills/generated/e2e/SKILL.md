---
name: e2e
description: "Skill for the E2e area of InnovMind. 12 symbols across 4 files."
---

# E2e

12 symbols | 4 files | Cohesion: 96%

## When to Use

- Working with code in `museum-backend/`
- Understanding how registerUser, loginUser, registerAndLogin work
- Modifying e2e-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | sleep, runDocker, waitForPostgres, startPostgresTestContainer, stop (+1) |
| `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts` | registerUser, loginUser, registerAndLogin |
| `museum-backend/tests/helpers/e2e/e2e-app-harness.ts` | request, stop |
| `museum-backend/tests/e2e/golden-paths-admin.e2e.test.ts` | promoteToAdmin |

## Entry Points

Start here when exploring this area:

- **`registerUser`** (Function) — `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts:36`
- **`loginUser`** (Function) — `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts:66`
- **`registerAndLogin`** (Function) — `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts:90`
- **`request`** (Function) — `museum-backend/tests/helpers/e2e/e2e-app-harness.ts:212`
- **`startPostgresTestContainer`** (Function) — `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts:72`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `registerUser` | Function | `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts` | 36 |
| `loginUser` | Function | `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts` | 66 |
| `registerAndLogin` | Function | `museum-backend/tests/helpers/e2e/e2e-auth.helpers.ts` | 90 |
| `request` | Function | `museum-backend/tests/helpers/e2e/e2e-app-harness.ts` | 212 |
| `startPostgresTestContainer` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 72 |
| `stop` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 96 |
| `scheduleStop` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 101 |
| `stop` | Function | `museum-backend/tests/helpers/e2e/e2e-app-harness.ts` | 246 |
| `promoteToAdmin` | Function | `museum-backend/tests/e2e/golden-paths-admin.e2e.test.ts` | 10 |
| `sleep` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 11 |
| `runDocker` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 15 |
| `waitForPostgres` | Function | `museum-backend/tests/helpers/e2e/postgres-testcontainer.ts` | 26 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Middleware | 1 calls |

## How to Explore

1. `gitnexus_context({name: "registerUser"})` — see callers and callees
2. `gitnexus_query({query: "e2e"})` — find related execution flows
3. Read key files listed above for implementation details
