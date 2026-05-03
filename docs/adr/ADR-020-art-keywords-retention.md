# ADR-020 — art_keywords retention policy

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem E
**Spec:** see git log (deleted 2026-05-03 — original in commit history)

## Context

`art_keywords` is a crowdsourced enrichment table — one row per
`(keyword, locale)` pair detected in user messages, with a hit counter.
The mobile app downloads this table on launch for offline classification,
so its size directly affects mobile bundle / sync time.

The long tail is dominated by single-hit entries: a typo, a one-off
foreign word, a non-art noun that briefly tripped the classifier. They
inflate the table without adding signal.

## Decision

Hard-delete rows where `hitCount <= 1` AND
`updatedAt < NOW() - 90 days`. Single-hit stale entries are crowdsourced
noise; 90 days gives a generous re-occurrence window. High-hit entries
(`hitCount > 1`) are real signal and stay forever (or until manual
moderation).

Override knobs: `RETENTION_ART_KEYWORDS_DAYS` (default 90),
`RETENTION_ART_KEYWORDS_HIT_THRESHOLD` (default 1).

Daily scheduled job at 03:15 UTC, chunked DELETE LIMIT 1000.

## Consequences

- Mobile sync stays small — the long tail of single-hit junk gets
  trimmed every 90 days.
- A real keyword that was typed once and forgotten gets re-added the
  next time anyone uses it (the atomic UPSERT in
  `TypeOrmArtKeywordRepository.upsert()` re-creates the row with
  `hitCount = 1`). No data loss for legitimate keywords.
- The dynamic-guardrail enrichment (which uses this table) loses access
  to single-hit stale entries — acceptable, since "1 hit in 90 days" is
  not a robust signal anyway.

## Alternatives considered

- Lower threshold (`hitCount = 0`): rejected — `hitCount` defaults to 1
  on insert, so 0 is impossible.
- Higher threshold (`hitCount <= 5`): rejected — would prune
  borderline-niche real keywords (e.g. obscure technique names that legitimately have low frequency).
- Time-based without hit-threshold: rejected — would delete real
  high-hit historical keywords. The hit-threshold is the signal.
