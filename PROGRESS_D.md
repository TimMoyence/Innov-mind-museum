# PROGRESS_D — Agent D (tests + docs + memory cleanup)

Sprint cleanup-2026-05-12. Worktree shared with A/B/C.

## État initial (2026-05-12)

- Memory: 38 .md + MEMORY.md → cible 20-21
- Docs: 227 .md hors node_modules → archive 8 800L
- Tests: 14 stryker-survivors, 4 fake-timer convert, 4 routes sans tests, 1 e2e skip, 1 god-test split, 1 Maestro audio
- ADRs: 33-34 doublons, 6 stubs à créer

## Actions

- [ ] D.1 — move stryker-survivors → mutation-killers/
- [ ] D.2 — fake timers (4 fichiers)
- [ ] D.3 — tests routes (4 nouveaux)
- [ ] D.4 — chaos-circuit-breaker.e2e activate or todo
- [ ] D.5 — auth.route.test.ts split (blocked by C.15)
- [ ] D.6 — Maestro audio-recording-flow.yml
- [ ] D.7 — archive explications-sprint-2026-05-05/
- [ ] D.8 — archive SPRINT_RECAP
- [ ] D.9 — purge plans c4/c5/stryker-incremental
- [ ] D.10 — merge ADR-033+034
- [ ] D.11 — fix dangling refs (18+)
- [ ] D.12 — purge museum-frontend/docs stales (3)
- [ ] D.13 — memory cleanup (12 DELETE + 2 MERGE + 6 UPDATE)
- [ ] D.14 — create 6+ ADRs deferred stubs
- [ ] D.15 — final dangling audit
- [ ] D.16 — final report

## Notes / Blockers

- D.5 dépend de C.15 — si C ne split pas, je saute.
- html-scraper.ts modif non-commited détectée au démarrage → travail de C, je n'y touche pas.
