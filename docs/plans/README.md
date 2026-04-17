# Plans Modulaires — Musaium Next Level

Plans d'exécution détaillés produits depuis le plan maître d'audit (2026-04-17).

## Index

### Phase 1 — Quick Wins (2-4 semaines)

| # | Plan | Effort | Pipeline /team |
|---|---|---|---|
| [01](PLAN_01_DOCS_CLEANUP.md) | Docs Cleanup | 1-2j | micro |
| [02](PLAN_02_TEAM_HARDENING.md) | /team Skill Hardening | 1j | standard |
| [03](PLAN_03_GITNEXUS_CARTOGRAPHY.md) | GitNexus Cartography Refresh | 0.5j | micro |

### Phase 2 — Refactors Structurels (1-3 mois)

| # | Plan | Effort | Pipeline /team |
|---|---|---|---|
| [04](PLAN_04_BACKEND_CHAT_SLIM.md) | Backend Chat Slim Down | 4-5j | enterprise |
| [05](PLAN_05_BACKEND_SHARED_TESTS.md) | Backend shared/ Tests | 2-3j | standard |
| [06](PLAN_06_BACKEND_WEBSEARCH_UNIFY.md) | Web Search Providers Unify | 2j | standard |
| [07](PLAN_07_MOBILE_TESTS_SETUP.md) | Mobile Tests Setup (CRITIQUE) | 5j | standard |
| [08](PLAN_08_MOBILE_CHAT_SPLIT.md) | Mobile Chat Split God-Hooks | 4-5j | enterprise |
| [09](PLAN_09_MOBILE_I18N_A11Y.md) | Mobile i18n + A11y | 3j | standard |
| [10](PLAN_10_ART_KEYWORDS_R15_FINALIZE.md) | Art Keywords R15 Finalize | 5j | standard |

### Phase 3 — V2 Next Level (3-6 mois)

| # | Plan | Effort | Pipeline /team |
|---|---|---|---|
| [11](PLAN_11_AI_GUARDRAILS_V2.md) | AI Guardrails Layer V2 | 3-4 sem | enterprise |
| [12](PLAN_12_MOBILE_PERF_V2.md) | Mobile Perf V2 (FlashList/Reanimated/Router v7) | 2-3 sem | enterprise |

## Lecture

Chaque plan suit la même structure :
1. **Context** — pourquoi ce plan existe
2. **Actions** — étapes concrètes avec fichiers et commandes
3. **Verification** — comment tester le résultat
4. **Fichiers Critiques** — paths précis
5. **Risques** — points d'attention
6. **Done When** — checklist de completion

## Exécution via /team

Chaque plan est dimensionné pour un pipeline /team spécifique :
- **micro** : 1-2 files, quick fix, team-lead + 1 specialist
- **standard** : feature avec tests, 3-5 agents
- **enterprise** : refactor cross-module, 7-9 agents

## Séquencement

```
Semaine 1-2  : P01 + P02 + P03                    (Phase 1 parallèle)
Semaine 3-6  : P04 + P05 + P06                    (BE séquentiel, P05 avant P04)
Semaine 4-8  : P07 → P08 → P09                    (Mobile, P07 débloque P08)
Semaine 7-10 : P10                                (Produit)
Mois 3-4     : P11 POC                            (V2 Phase 3)
Mois 4-5     : P12 perf                           (V2 Phase 3)
```

Phase 1 entièrement parallèle (3 plans indépendants).
Phase 2 BE et mobile parallélisables si 2 développeurs.

## Reports & Artefacts

Chaque plan produit des rapports dans `docs/plans/reports/` :
- `P03-cartography-snapshot-*.md` — snapshot GitNexus
- `P08-perf-before-after.md` — mesures avant/après
- `P09-i18n-inventory.md` + `P09-a11y-audit.md`
- `P10-benchmark.md` — classifier offline
- `P11-benchmark.md` + `P11-decision.md` — guardrails V2
- `P12-baseline.md` + `P12-after.md` — perf mobile

## Références

- **Plan maître** : session conversationnelle 2026-04-17 (hors repo, résumé dans README ci-dessus)
- **Tracking** : `docs/V1_Sprint/PROGRESS_TRACKER.md`
- **Journal** : `docs/V1_Sprint/SPRINT_LOG.md`
- **Index docs** : `docs/DOCS_INDEX.md` (créé par P01)
