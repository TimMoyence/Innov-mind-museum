# ADR-018 — support_tickets retention policy

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem E
**Spec:** see git log (deleted 2026-05-03 — original in commit history)

## Context

`support_tickets` (and cascading `ticket_messages`) grows unbounded today.
Every ticket — open, closed, resolved, spam — stays in the table forever.
After 12-24 months at current write rate, the table dominates backup size,
slows admin moderation queries, and increases the data-export attack surface
for adversarial-discovery requests.

## Decision

Hard-delete tickets where `status IN ('closed', 'resolved')` AND
`updatedAt < NOW() - 365 days`. Cascading FK on `ticket_messages.ticket_id`
removes the conversation messages atomically.

Open tickets (`status NOT IN ('closed', 'resolved')`) are NEVER auto-pruned.
Long-open tickets (>365 days) surface as a separate ops alert (out of scope
for this ADR; subsystem H wires the alert).

Override knob: `RETENTION_SUPPORT_TICKETS_DAYS` env var (default 365).

Daily scheduled job at 03:15 UTC runs the prune in chunked DELETE LIMIT
1000 per transaction.

## Consequences

- After 365 days, closed/resolved tickets vanish from the admin dashboard.
  This is the intended UX — the data was already terminal-state and rarely
  re-opened.
- Audit logs (immutable, separate table) retain action records of ticket
  creation/resolution beyond the prune horizon, so the historical trail of
  "ticket X was created/resolved" survives even after the row is gone.
- The 365-day window matches SOC2 Type II audit horizon (12 months
  operational support history). If a future legal-hold requires longer
  retention, override via env var BEFORE the next prune run.
- First scheduled run after deploy will likely delete a multi-month backlog
  in a single night. Chunked LIMIT 1000 means ~10 minutes for 100K tickets;
  acceptable inside a 03:15 UTC window.

## Alternatives considered

- Soft-delete (`deleted_at`): rejected — adds query complexity (every read
  filters `WHERE deleted_at IS NULL`), invites zombie data accumulation, and
  no business case for "undelete a 1-year-old closed ticket".
- 90 / 180 day windows: rejected — too aggressive for SOC2 horizon.
- 730 / unlimited days: rejected — defeats the purpose of having a retention
  policy.
