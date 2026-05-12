# ADR-040 — C3 image comparative full UI deferred to V1.1

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1)

## Context

The "C3 image comparative full" surface — side-by-side image carousel with diff overlay, allowing visitors to compare two artworks visually — is on `docs/ROADMAP_PRODUCT.md` LATER but was being pulled toward NOW in earlier sprint plans. Decision today: defer to V1.1.

## Decision

Ship V1 (2026-06-01) without the C3 comparative-full surface. AI-side suggested images (see ADR linked at [[c2-ai-side-only]]) remain the only image enrichment path. Comparative-full UI is deferred to V1.1 (target 2026-Q3) when:

- B2B traction confirms the feature is a buyer requirement
- Visual-similarity pipeline (ADR-037) has produced ≥4 weeks of recall-evidence in prod
- Mobile carousel performance budget on iOS 16+ confirmed acceptable

## Consequences

- V1 scope stays tight.
- ROADMAP wording for C3 must be re-clarified at next rotation to avoid the same misread as [[c2-ai-side-only]] suffered.
- No code or schema reservation needed today — pure UI feature, no migration debt.

## Reopen trigger

Any of: B2B buyer requirement, V1 launch stable ≥4 weeks, design spike validated by visitor user-test (>5 sessions).
