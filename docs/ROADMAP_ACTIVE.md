# Roadmap Active — Musaium

> Résumé exécutif de la roadmap produit courante. Mis à jour à chaque sprint.
> Source détaillée : [`docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md`](archive/roadmaps/V3_REVIEW_AND_PLAN.md)

## Horizon courant : Préparation V1 (2026-04-18)

Audit enterprise du 2026-04-18 → **6 sprints NL-4 à NL-9** pour porter Musaium au niveau V1 (guide en marchant + guide en musée, 100% ping/vocal/photo/streaming). Aucune nouvelle feature ; on améliore l'existant.

**Rapport complet :** [`.claude/skills/team/team-reports/2026-04-18-NL-feature-audit/`](../.claude/skills/team/team-reports/2026-04-18-NL-feature-audit/README.md)

- NL-4 Chat UX Unification V1 (P0, ~7 j) — inclut LOT 1 flags (voice+streaming) cf. [`FEATURE_FLAGS_AUDIT.md`](plans/FEATURE_FLAGS_AUDIT.md)
- NL-5 Walking Guide UX V1 (P1, ~7 j)
- NL-6 Cross-app Coherence (P1, ~1.5 j)
- NL-7 FE Test Coverage (P2, ~3 j)
- NL-8 BE Modularization (P2, ~7 j)
- NL-9 Perf & Design Polish (P2/P3, ~5 j)

**Pivot S1 BE (2026-04-19) :** le POC Realtime WebRTC initialement prévu a été remplacé par l'**activation et l'extension du pipeline voice classique existant** (STT `gpt-4o-mini-transcribe` → LangChain → TTS `gpt-4o-mini-tts` cachable S3). Voir [`AI_VOICE.md`](AI_VOICE.md). Realtime WebRTC reporté V1.1 — réévaluation après mesure de latence terrain.

**Suppression feature flags (2026-04-19) :** `FEATURE_FLAG_VOICE_MODE` + `FEATURE_FLAG_STREAMING` + `TTS_ENABLED` retirés. Décision produit : l'utilisateur a toutes les features, pas la moitié. SSE reste @deprecated (cf. [`adr/ADR-001-sse-streaming-deprecated.md`](adr/ADR-001-sse-streaming-deprecated.md)). Audit des 9 flags restants à faire dans plan séparé.

## Historique : Next Level Phase 1-3 (2026-04-17)

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

Voir [`docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md`](archive/v1-sprint-2026-04/PROGRESS_TRACKER.md) section "Next Level Roadmap — Plans Modulaires" pour l'historique d'avancement. Suivi actif désormais via `.claude/tasks/` + `team-reports/`.

## Vision V3 (contexte historique)

Musaium à maturité V2.0 (auth + chat multimodal + conversations + museums + support + admin web). Prochains axes stratégiques (selon V3_REVIEW_AND_PLAN 2026-03-26) :

1. **Qualité mobile** — couverture tests composants UI (critique)
2. **Admin web complet** — 4 pages scaffold à finaliser (analytics, reports, tickets, support)
3. **Wikidata knowledge enrichment** — spec écrite, différenciateur concurrentiel #1
4. **Observabilité** — Sentry web, cache Docker CI
5. **Perf mobile** — benchmarking, profiling, FPS monitoring

## Références

- Plans modulaires archivés : [`docs/archive/plans-2026-04-17/`](archive/plans-2026-04-17/)
- Tracking sprint archivé : [`docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md`](archive/v1-sprint-2026-04/PROGRESS_TRACKER.md)
- Journal sprint archivé : [`docs/archive/v1-sprint-2026-04/SPRINT_LOG.md`](archive/v1-sprint-2026-04/SPRINT_LOG.md)
- Roadmap V2 complète : [`docs/ROADMAP_V2.md`](ROADMAP_V2.md)
- Audit enterprise-grade 2026-04-20 : [`docs/plans/MASTER_PLAN.md`](plans/MASTER_PLAN.md)
