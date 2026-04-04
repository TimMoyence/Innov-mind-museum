---
name: scripts
description: "Skill for the Scripts area of InnovMind. 14 symbols across 3 files."
---

# Scripts

14 symbols | 3 files | Cohesion: 97%

## When to Use

- Working with code in `museum-backend/`
- Understanding how requireEnv, getEnv, sleep work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/scripts/smoke-api.cjs` | requireEnv, getEnv, sleep, buildUrl, fetchJson (+4) |
| `museum-frontend/scripts/check-i18n-completeness.js` | flattenKeys, getNestedValue, run |
| `museum-backend/scripts/check-openapi-spec.cjs` | fail, assert |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `requireEnv` | Function | `museum-backend/scripts/smoke-api.cjs` | 7 |
| `getEnv` | Function | `museum-backend/scripts/smoke-api.cjs` | 15 |
| `sleep` | Function | `museum-backend/scripts/smoke-api.cjs` | 23 |
| `buildUrl` | Function | `museum-backend/scripts/smoke-api.cjs` | 27 |
| `fetchJson` | Function | `museum-backend/scripts/smoke-api.cjs` | 31 |
| `waitForHealthyApi` | Function | `museum-backend/scripts/smoke-api.cjs` | 85 |
| `ensureLogin` | Function | `museum-backend/scripts/smoke-api.cjs` | 123 |
| `login` | Function | `museum-backend/scripts/smoke-api.cjs` | 124 |
| `main` | Function | `museum-backend/scripts/smoke-api.cjs` | 170 |
| `flattenKeys` | Function | `museum-frontend/scripts/check-i18n-completeness.js` | 16 |
| `getNestedValue` | Function | `museum-frontend/scripts/check-i18n-completeness.js` | 29 |
| `run` | Function | `museum-frontend/scripts/check-i18n-completeness.js` | 39 |
| `fail` | Function | `museum-backend/scripts/check-openapi-spec.cjs` | 8 |
| `assert` | Function | `museum-backend/scripts/check-openapi-spec.cjs` | 13 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → BuildUrl` | intra_community | 3 |
| `Main → Sleep` | intra_community | 3 |
| `Main → Get` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "requireEnv"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
