---
name: admin
description: "Skill for the Admin area of InnovMind. 18 symbols across 10 files."
---

# Admin

18 symbols | 10 files | Cohesion: 84%

## When to Use

- Working with code in `museum-web/`
- Understanding how useAdminDict, AdminPagination, AdminDashboardPage work
- Modifying admin-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-web/src/app/[locale]/admin/page.tsx` | getStatLabel, AdminDashboardPage, fetchStats |
| `museum-backend/tests/unit/modules/admin/changeUserRole.useCase.test.ts` | makeUser, makePaginatedAdmins, makeRepo |
| `museum-web/src/components/admin/AdminShell.tsx` | AuthenticatedLayout, isActive |
| `museum-web/src/app/[locale]/admin/tickets/page.tsx` | TicketsPage, handleUpdate |
| `museum-web/src/app/[locale]/admin/reports/page.tsx` | ReportsPage, handleReview |
| `museum-backend/tests/unit/modules/admin/admin-repository.test.ts` | makeMockQb, buildMocks |
| `museum-web/src/lib/admin-dictionary.tsx` | useAdminDict |
| `museum-web/src/components/admin/AdminPagination.tsx` | AdminPagination |
| `museum-web/src/app/[locale]/admin/login/page.tsx` | AdminLoginPage |
| `museum-web/src/app/[locale]/admin/audit-logs/page.tsx` | AuditLogsPage |

## Entry Points

Start here when exploring this area:

- **`useAdminDict`** (Function) — `museum-web/src/lib/admin-dictionary.tsx:23`
- **`AdminPagination`** (Function) — `museum-web/src/components/admin/AdminPagination.tsx:11`
- **`AdminDashboardPage`** (Function) — `museum-web/src/app/[locale]/admin/page.tsx:38`
- **`fetchStats`** (Function) — `museum-web/src/app/[locale]/admin/page.tsx:51`
- **`TicketsPage`** (Function) — `museum-web/src/app/[locale]/admin/tickets/page.tsx:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useAdminDict` | Function | `museum-web/src/lib/admin-dictionary.tsx` | 23 |
| `AdminPagination` | Function | `museum-web/src/components/admin/AdminPagination.tsx` | 11 |
| `AdminDashboardPage` | Function | `museum-web/src/app/[locale]/admin/page.tsx` | 38 |
| `fetchStats` | Function | `museum-web/src/app/[locale]/admin/page.tsx` | 51 |
| `TicketsPage` | Function | `museum-web/src/app/[locale]/admin/tickets/page.tsx` | 27 |
| `handleUpdate` | Function | `museum-web/src/app/[locale]/admin/tickets/page.tsx` | 82 |
| `ReportsPage` | Function | `museum-web/src/app/[locale]/admin/reports/page.tsx` | 20 |
| `handleReview` | Function | `museum-web/src/app/[locale]/admin/reports/page.tsx` | 72 |
| `AdminLoginPage` | Function | `museum-web/src/app/[locale]/admin/login/page.tsx` | 5 |
| `AuditLogsPage` | Function | `museum-web/src/app/[locale]/admin/audit-logs/page.tsx` | 8 |
| `AuthenticatedLayout` | Function | `museum-web/src/components/admin/AdminShell.tsx` | 37 |
| `isActive` | Function | `museum-web/src/components/admin/AdminShell.tsx` | 50 |
| `getStatLabel` | Function | `museum-web/src/app/[locale]/admin/page.tsx` | 32 |
| `makeUser` | Function | `museum-backend/tests/unit/modules/admin/changeUserRole.useCase.test.ts` | 13 |
| `makePaginatedAdmins` | Function | `museum-backend/tests/unit/modules/admin/changeUserRole.useCase.test.ts` | 25 |
| `makeRepo` | Function | `museum-backend/tests/unit/modules/admin/changeUserRole.useCase.test.ts` | 33 |
| `makeMockQb` | Function | `museum-backend/tests/unit/modules/admin/admin-repository.test.ts` | 12 |
| `buildMocks` | Function | `museum-backend/tests/unit/modules/admin/admin-repository.test.ts` | 77 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `TicketsPage → Delete` | cross_community | 4 |
| `TicketsPage → StopSweep` | cross_community | 4 |
| `ReportsPage → Delete` | cross_community | 4 |
| `ReportsPage → StopSweep` | cross_community | 4 |
| `AuditLogsPage → Delete` | cross_community | 4 |
| `AuditLogsPage → StopSweep` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Middleware | 3 calls |

## How to Explore

1. `gitnexus_context({name: "useAdminDict"})` — see callers and callees
2. `gitnexus_query({query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
