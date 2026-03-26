---
name: V3 strategic decisions
description: User decisions on V3 plan — E2E mobile urgent, Lighthouse CI important, Wikidata spec must be re-validated
type: project
---

V3 plan decisions made 2026-03-26:

1. **E2E mobile automated tests (Maestro) = URGENT** — user explicitly marked as urgent/important. Must be prioritized in V3.2.
   **Why:** At 4.5/5 functionality, no automated E2E means parcours regressions are invisible.
   **How to apply:** Schedule Maestro setup early in V3.2, not as "FUTUR".

2. **Lighthouse CI for museum-web = IMPORTANT** — user wants performance regression prevention.
   **Why:** 147kB First Load can drift without continuous measurement.
   **How to apply:** Add to V3.2 quality sprint.

3. **Wikidata spec must be re-validated before implementation** — spec dates from S8, architecture has evolved (hexagonal, split services).
   **Why:** 17h of work based on a potentially outdated spec = risk of rework.
   **How to apply:** First task of Wikidata sprint = read + update spec, THEN implement.
