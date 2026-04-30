# ADR-013 — Admin facade is kept (not dropped)

Status: Accepted — 2026-04-30
Context: Audit 2026-04-30 finding F7

## Question

The 2026-04-30 audit flagged `museum-backend/src/modules/admin/adapters/secondary/admin.repository.pg.ts` as an "anemic facade" because it imports entities from three other modules (`auth.User`, `chat.ChatMessage`, `chat.ChatSession`, `chat.MessageReport`, `shared.AuditLog`) without owning any of them. The audit offered two paths:

1. **Inline** the queries directly into admin route handlers and delete the facade.
2. **Justify** the indirection.

This ADR records the decision: **justify and keep the facade**.

## Decision

The admin module continues to expose a single `IAdminRepository` port and one `AdminRepositoryPg` adapter that implements it. The facade stays.

## Why not inline

Inlining would mean admin routes call into:

- `userRepository.listUsersFiltered(...)` (a new method we'd add to `IUserRepository` in the auth module)
- the chat module for report listing + resolution
- the shared audit service for audit-log listing
- some new aggregation utility for `getStats()`

That pushes admin-specific shapes into modules whose primary callers are end-users, dilutes the auth/chat module APIs with admin-only methods, and forces admin DTO mapping (e.g. `mapUser`, `mapReport`, `mapAuditLog`) to live wherever each query lands. The "anemic" appearance disappears, but at the cost of scattering the admin concern.

## Why the facade is the right shape here

- **Bounded context**. Admin is a real bounded context — back-office operators have different read needs (filters, pagination, role-aware DTOs, audit-log slices) than the public API. Aggregating those reads behind one port is the textbook anti-corruption layer between admin and the source modules.
- **DTO mapping is admin-owned**. `mapUser`, `mapReport`, and `mapAuditLog` shape entities into admin-facing DTOs (ISO date strings, role-aware fields, joined-message context). They belong in `admin/`, not in the source modules.
- **Port enables test doubles**. Existing tests (e.g. `tests/unit/admin/`) substitute `IAdminRepository` cleanly. Inlining would make admin route tests depend on auth + chat + audit repository internals together.
- **Size + cohesion is fine**. 337 lines of cohesive admin queries with focused mapping helpers is well below the threshold where a facade becomes a god-object. The analytics queries already moved into a sibling file (`admin-analytics-queries.ts`) as soon as they grew enough to warrant their own home.
- **Module boundary stays clean**. The other modules (`auth`, `chat`, `shared/audit`) keep their entity-graph imports unidirectional — `admin` reads from them, never the reverse — and we have an obvious place to land any future admin-only invariant (e.g. soft-delete filtering, role-based redaction).

## What "anemic" actually means here

"Anemic" was the audit author's read because the file mostly delegates to TypeORM repositories. It is anemic in domain *behavior* — the admin module does not own the source entities, so mutations belong in the source modules' use cases (already the case for `changeUserRole` which calls `userRepo.save`). The *queries* are not anemic: they encode admin-specific filtering, pagination, and DTO shaping that nothing else needs.

## Consequences

- The facade is preserved as written. Future admin queries land here; they do not belong inlined into admin routes.
- If the file grows past ~600 lines, split by sub-domain (e.g. `admin-users.repository.pg.ts`, `admin-reports.repository.pg.ts`) rather than dropping the abstraction.
- Mutations (role change, report resolution) stay in admin because they own the cross-cutting policy (e.g. "only admins can change roles") even though the underlying `userRepo.save` lives in auth.
- Auth, chat, and shared modules MUST NOT add admin-only methods to their public interfaces. Admin reads through query builders, not through admin-tagged repository methods.
