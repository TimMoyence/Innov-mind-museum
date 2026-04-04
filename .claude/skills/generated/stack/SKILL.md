---
name: stack
description: "Skill for the (stack) area of InnovMind. 32 symbols across 14 files."
---

# (stack)

32 symbols | 14 files | Cohesion: 76%

## When to Use

- Working with code in `museum-frontend/`
- Understanding how pickMuseumBackground, NotFoundScreen, MuseumsScreen work
- Modifying (stack)-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/app/(stack)/ticket-detail.tsx` | statusColor, priorityColor, formatDate, TicketDetailScreen, handleSend (+1) |
| `museum-frontend/features/support/infrastructure/ticketApi.ts` | getTicketDetail, addTicketMessage, listTickets, createTicket |
| `museum-frontend/app/(stack)/tickets.tsx` | statusColor, priorityColor, formatDate, TicketsScreen |
| `museum-frontend/app/(stack)/create-ticket.tsx` | priorityColor, CreateTicketScreen, priorityLabel, handleSubmit |
| `museum-frontend/app/(stack)/support.tsx` | SupportScreen, openChannel, shareChannels |
| `museum-frontend/app/(stack)/discover.tsx` | DiscoverScreen, startConversation |
| `museum-frontend/app/(stack)/change-password.tsx` | ChangePasswordScreen, onSubmit |
| `museum-frontend/shared/ui/liquidTheme.ts` | pickMuseumBackground |
| `museum-frontend/app/+not-found.tsx` | NotFoundScreen |
| `museum-frontend/app/(tabs)/museums.tsx` | MuseumsScreen |

## Entry Points

Start here when exploring this area:

- **`pickMuseumBackground`** (Function) — `museum-frontend/shared/ui/liquidTheme.ts:55`
- **`NotFoundScreen`** (Function) — `museum-frontend/app/+not-found.tsx:10`
- **`MuseumsScreen`** (Function) — `museum-frontend/app/(tabs)/museums.tsx:20`
- **`TermsScreen`** (Function) — `museum-frontend/app/(stack)/terms.tsx:12`
- **`SupportScreen`** (Function) — `museum-frontend/app/(stack)/support.tsx:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `pickMuseumBackground` | Function | `museum-frontend/shared/ui/liquidTheme.ts` | 55 |
| `NotFoundScreen` | Function | `museum-frontend/app/+not-found.tsx` | 10 |
| `MuseumsScreen` | Function | `museum-frontend/app/(tabs)/museums.tsx` | 20 |
| `TermsScreen` | Function | `museum-frontend/app/(stack)/terms.tsx` | 12 |
| `SupportScreen` | Function | `museum-frontend/app/(stack)/support.tsx` | 22 |
| `openChannel` | Function | `museum-frontend/app/(stack)/support.tsx` | 28 |
| `shareChannels` | Function | `museum-frontend/app/(stack)/support.tsx` | 52 |
| `OnboardingScreen` | Function | `museum-frontend/app/(stack)/onboarding.tsx` | 26 |
| `GuidedMuseumModeScreen` | Function | `museum-frontend/app/(stack)/guided-museum-mode.tsx` | 12 |
| `DiscoverScreen` | Function | `museum-frontend/app/(stack)/discover.tsx` | 17 |
| `startConversation` | Function | `museum-frontend/app/(stack)/discover.tsx` | 24 |
| `ChangePasswordScreen` | Function | `museum-frontend/app/(stack)/change-password.tsx` | 15 |
| `onSubmit` | Function | `museum-frontend/app/(stack)/change-password.tsx` | 26 |
| `TicketDetailScreen` | Function | `museum-frontend/app/(stack)/ticket-detail.tsx` | 65 |
| `handleSend` | Function | `museum-frontend/app/(stack)/ticket-detail.tsx` | 97 |
| `TicketsScreen` | Function | `museum-frontend/app/(stack)/tickets.tsx` | 61 |
| `statusLabel` | Function | `museum-frontend/app/(stack)/ticket-detail.tsx` | 117 |
| `CreateTicketScreen` | Function | `museum-frontend/app/(stack)/create-ticket.tsx` | 30 |
| `priorityLabel` | Function | `museum-frontend/app/(stack)/create-ticket.tsx` | 40 |
| `handleSubmit` | Function | `museum-frontend/app/(stack)/create-ticket.tsx` | 51 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `DiscoverScreen → EnsureContract` | cross_community | 4 |
| `CreateTicketScreen → CreateTicket` | intra_community | 3 |
| `SupportScreen → T` | cross_community | 3 |
| `ChangePasswordScreen → ChangePassword` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 3 calls |
| Infrastructure | 1 calls |

## How to Explore

1. `gitnexus_context({name: "pickMuseumBackground"})` — see callers and callees
2. `gitnexus_query({query: "(stack)"})` — find related execution flows
3. Read key files listed above for implementation details
