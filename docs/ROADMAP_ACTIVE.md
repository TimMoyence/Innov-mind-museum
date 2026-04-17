# Roadmap Active — Musaium

> Résumé exécutif de la roadmap produit courante. Mis à jour à chaque sprint.
> Source détaillée : [`docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md`](archive/roadmaps/V3_REVIEW_AND_PLAN.md)

## Horizon courant : Next Level (2026-04-17)

12 plans modulaires produits dans [`docs/plans/`](plans/README.md) après audit approfondi.

### Phase 1 — Quick Wins (2-4 semaines)

- P01 Docs Cleanup — supprimer obsolètes, merger runbooks, index central
- P02 /team Skill Hardening — system prompts durcis agents + sdlc-index
- P03 GitNexus Cartography — refresh + validation tools/skills

### Phase 2 — Refactors Structurels (1-3 mois)

- P04 Backend Chat Slim — -50% LOC sur 3 files obèses du module chat
- P05 Backend shared/ Tests — coverage audit, cache, feature-flags
- P06 Web Search Providers Unify — 5 adapters sous 1 interface
- **P07 Mobile Tests Setup (CRITIQUE)** — coverage 0% → 30%
- P08 Mobile Chat Split — dépêtrer useChatSession 442L + ChatMessageBubble 365L
- P09 Mobile i18n + A11y — 20% → 100% coverage
- P10 Art Keywords R15 Finalize — sprint WIP à boucler

### Phase 3 — V2 Next Level (3-6 mois)

- P11 AI Guardrails Layer V2 — POC NeMo/Prompt Armor + benchmark
- P12 Mobile Perf V2 — FlashList v2, Reanimated 3, Expo Router v7

## Sprint courant

Voir [`docs/V1_Sprint/PROGRESS_TRACKER.md`](V1_Sprint/PROGRESS_TRACKER.md) section "Next Level Roadmap — Plans Modulaires" pour l'état d'avancement.

## Vision V3 (contexte historique)

Musaium à maturité V2.0 (auth + chat multimodal + conversations + museums + support + admin web). Prochains axes stratégiques (selon V3_REVIEW_AND_PLAN 2026-03-26) :

1. **Qualité mobile** — couverture tests composants UI (critique)
2. **Admin web complet** — 4 pages scaffold à finaliser (analytics, reports, tickets, support)
3. **Wikidata knowledge enrichment** — spec écrite, différenciateur concurrentiel #1
4. **Observabilité** — Sentry web, cache Docker CI
5. **Perf mobile** — benchmarking, profiling, FPS monitoring

## Références

- Plans modulaires détaillés : [`docs/plans/README.md`](plans/README.md)
- Tracking sprint : [`docs/V1_Sprint/PROGRESS_TRACKER.md`](V1_Sprint/PROGRESS_TRACKER.md)
- Journal sprint : [`docs/V1_Sprint/SPRINT_LOG.md`](V1_Sprint/SPRINT_LOG.md)
- Roadmap V2 complète : [`docs/V1_Sprint/MASTER_ROADMAP_V2.md`](V1_Sprint/MASTER_ROADMAP_V2.md)
- Plan maître d'audit : `/Users/Tim/.claude/plans/j-aimerais-que-tu-fasse-nested-boole.md`
