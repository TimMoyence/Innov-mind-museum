# ADR-019 — reviews retention policy

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem E
**Spec:** see git log (deleted 2026-05-03 — original in commit history)

## Context

`reviews` accumulates pending and rejected entries indefinitely. Approved
reviews are user-visible and stay forever, but the moderation-queue debris
and the rejected entries serve no ongoing operational purpose after a short
audit window.

## Decision

Two prune rules, both hard-delete:

1. `status = 'rejected'` AND `updatedAt < NOW() - 30 days` → delete.
   Rejected entries had moderator review; 30 days is enough to handle
   moderator-disagreement reverts.
2. `status = 'pending'` AND `createdAt < NOW() - 60 days` → delete.
   Stale pending entries are abandoned moderation queue debris (the
   reviewer didn't get to them in 60 days; assume the user has moved on).

`status = 'approved'` is NEVER auto-pruned. Approved reviews are public
content and only manual moderation (e.g., DMCA takedown) removes them.

Override knobs: `RETENTION_REVIEWS_REJECTED_DAYS` (default 30),
`RETENTION_REVIEWS_PENDING_DAYS` (default 60).

Daily scheduled job at 03:15 UTC, chunked DELETE LIMIT 1000.

## Consequences

- Rejected reviews disappear from admin moderation history after 30 days.
  Audit log (separate table, immutable) preserves the "review X was
  rejected by moderator Y" trail.
- The pending queue stays clean — no infinite-old "needs review" entries.
- Approved reviews remain forever, matching their user-visible role.

## Alternatives considered

- Anonymise rejected reviews instead of deleting: rejected — no
  legal/compliance requirement to retain anonymised content, and
  anonymisation invites future re-identification debate.
- Keep rejected forever: rejected — moderator-rejected content is the
  largest chunk of unbounded growth in this table.
