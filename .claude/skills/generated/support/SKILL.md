---
name: support
description: "Skill for the Support area of InnovMind. 21 symbols across 8 files."
---

# Support

21 symbols | 8 files | Cohesion: 92%

## When to Use

- Working with code in `museum-backend/`
- Understanding how apiPost, AdminSupportPage, handleSendReply work
- Modifying support-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | createTicket, listTickets, getTicketById, addMessage, updateTicket (+3) |
| `museum-web/src/app/[locale]/admin/support/page.tsx` | isStaffRole, formatDate, AdminSupportPage, handleSendReply |
| `museum-web/src/components/auth/ResetPasswordForm.tsx` | ResetPasswordFormInner, handleSubmit |
| `museum-backend/tests/unit/support/support-repository.test.ts` | makeMockQb, buildMocks |
| `museum-web/src/app/[locale]/support/ContactForm.tsx` | submitContact, handleSubmit |
| `museum-web/src/lib/api.ts` | apiPost |
| `museum-backend/src/modules/support/domain/support.repository.interface.ts` | ISupportRepository |
| `museum-backend/src/modules/support/adapters/secondary/support.repository.pg.ts` | SupportRepositoryPg |

## Entry Points

Start here when exploring this area:

- **`apiPost`** (Function) — `museum-web/src/lib/api.ts:185`
- **`AdminSupportPage`** (Function) — `museum-web/src/app/[locale]/admin/support/page.tsx:42`
- **`handleSendReply`** (Function) — `museum-web/src/app/[locale]/admin/support/page.tsx:82`
- **`submitContact`** (Function) — `museum-web/src/app/[locale]/support/ContactForm.tsx:18`
- **`handleSubmit`** (Function) — `museum-web/src/app/[locale]/support/ContactForm.tsx:50`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `InMemorySupportRepository` | Class | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 36 |
| `SupportRepositoryPg` | Class | `museum-backend/src/modules/support/adapters/secondary/support.repository.pg.ts` | 46 |
| `apiPost` | Function | `museum-web/src/lib/api.ts` | 185 |
| `AdminSupportPage` | Function | `museum-web/src/app/[locale]/admin/support/page.tsx` | 42 |
| `handleSendReply` | Function | `museum-web/src/app/[locale]/admin/support/page.tsx` | 82 |
| `submitContact` | Function | `museum-web/src/app/[locale]/support/ContactForm.tsx` | 18 |
| `handleSubmit` | Function | `museum-web/src/app/[locale]/support/ContactForm.tsx` | 50 |
| `ISupportRepository` | Interface | `museum-backend/src/modules/support/domain/support.repository.interface.ts` | 12 |
| `createTicket` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 40 |
| `listTickets` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 57 |
| `getTicketById` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 84 |
| `addMessage` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 98 |
| `updateTicket` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 118 |
| `toTicketDTO` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 168 |
| `toMessageDTO` | Method | `museum-backend/tests/helpers/support/inMemorySupportRepository.ts` | 185 |
| `ResetPasswordFormInner` | Function | `museum-web/src/components/auth/ResetPasswordForm.tsx` | 13 |
| `handleSubmit` | Function | `museum-web/src/components/auth/ResetPasswordForm.tsx` | 60 |
| `isStaffRole` | Function | `museum-web/src/app/[locale]/admin/support/page.tsx` | 26 |
| `formatDate` | Function | `museum-web/src/app/[locale]/admin/support/page.tsx` | 30 |
| `makeMockQb` | Function | `museum-backend/tests/unit/support/support-repository.test.ts` | 36 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleSendReply → GetBaseUrl` | cross_community | 6 |
| `HandleSendReply → ApiError` | cross_community | 6 |
| `HandleSendReply → SetTokens` | cross_community | 6 |
| `HandleSendReply → ProcessQueue` | cross_community | 5 |
| `HandleSendReply → ClearTokens` | cross_community | 5 |
| `HandleSendReply → OnLogout` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Chat | 2 calls |
| Application | 1 calls |
| Admin | 1 calls |

## How to Explore

1. `gitnexus_context({name: "apiPost"})` — see callers and callees
2. `gitnexus_query({query: "support"})` — find related execution flows
3. Read key files listed above for implementation details
