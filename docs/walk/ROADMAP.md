# MUSAIUM — Post-V1 Roadmap

> **Date**: 2026-03-30 | **Status**: APPROUVE | **Priorite**: S0 + S1 immediat, S2-S5 post-traction

## Vision

Musaium V1 est production-ready. L'objectif est de lancer, valider le product-market fit, puis construire Museum Walk incrementalement.

## Challenges vs Strategie V2 originale

| # | Challenge | Decision |
|---|----------|----------|
| 1 | Testing AVANT features | Services chat core sans tests unitaires. Walk modifie le pipeline LLM — on teste d'abord |
| 2 | Walk Phase A = 2 sem, pas 5j | react-native-webview pas installe, bridge Leaflet non trivial |
| 3 | Push notifs != quick win | expo-notifications pas installe, module natif, deplace en S3 |
| 4 | Free tier gate en S0 | Ne pas lancer gratuit illimite puis ajouter paywall |
| 5 | robots.txt + sitemap existent | Ne pas refaire ce qui existe |
| 6 | museum-web a 8 tests | Mais pas executes en CI |

## Timeline

```
Sem 1-2:   S0 Foundation (tests, stores, free tier, Sentry web)
Sem 3:     S1 Quick Wins (review, maps link, share, Daily Art)
           --- STORE APPROVAL + PREMIERS UTILISATEURS ---
Sem 4-5:   S2 Walk Phase A (carte, routes, preview)
Sem 6-7:   S3 Walk Phase B (GPS, narration, audio, notifications)
Sem 8-9:   S4 Monetisation + Retention (IAP, subscription, collection)
Sem 10-11: S5 Scale + Polish (routes IA, offline, Year in Culture)
Sem 12:    Buffer (bugs, feedback, financement)
```

## Dependency Graph

```
S0 Foundation ──────────────────────────────────────────────────┐
  ├─ S1 Quick Wins ──── S2 Walk Phase A ──── S3 Walk Phase B ──┤
  │     │                                         │             │
  │     └─ Daily Art ───────── Collection (S4) ───┘             │
  │                                │                            │
  └─ Free tier gate (S0) ──────── Paywall UI (S4) ─────────────┤
                                       │                        │
                                  S5 Scale + Polish ────────────┘
```

## Sprints

| Sprint | Duree | Fichier | Focus |
|--------|-------|---------|-------|
| S0 | 2 sem | [SPRINT_0.md](SPRINT_0.md) | Foundation (tests, stores, free tier, Sentry) |
| S1 | 1 sem | [SPRINT_1.md](SPRINT_1.md) | Quick Wins (review, maps, share, Daily Art) |
| S2 | 2 sem | [SPRINT_2.md](SPRINT_2.md) | Walk Phase A (carte Leaflet, routes OSRM) |
| S3 | 2 sem | [SPRINT_3.md](SPRINT_3.md) | Walk Phase B (GPS, narration IA, TTS, notifs) |
| S4 | 2 sem | [SPRINT_4.md](SPRINT_4.md) | Monetisation + Retention (RevenueCat, Collection) |
| S5 | 2 sem | [SPRINT_5.md](SPRINT_5.md) | Scale + Polish (routes IA, offline, YiC, SEO) |

## Quality Gates (chaque sprint)

| Check | Commande | Seuil |
|-------|----------|-------|
| TypeScript | `tsc --noEmit` (3 packages) | 0 errors |
| Tests backend | `pnpm test` | Tous passent |
| Tests frontend | `npm test` | Tous passent |
| Coverage statements | threshold | >=71% |
| Coverage branches | threshold | >=55% |
| i18n sync | `npm run check:i18n` | 8 locales completes |
| OpenAPI | `pnpm openapi:validate` | PASS |
| Security | Trivy scan Docker | 0 CRITICAL/HIGH |

## Metriques de Succes

| Metrique | S0 | S1 | S2 | S3 | S4 | S5 |
|----------|-----|-----|-----|-----|-----|-----|
| Tests backend | 1300+ | 1310+ | 1320+ | 1350+ | 1370+ | 1400+ |
| Tests frontend | 110+ | 115+ | 125+ | 135+ | 145+ | 155+ |
| Note stores | -- | 4.5+ | 4.5+ | 4.6+ | 4.6+ | 4.7+ |
| MAU | -- | 200 | 500 | 1K | 1.5K | 3K |
| Walk starts | -- | -- | 50 | 200 | 500 | 1K |
| Conversion | -- | -- | -- | -- | 3% | 5% |
| D7 retention | -- | 15% | 16% | 18% | 20% | 22% |
| Revenue/mois | 0 | 0 | 0 | 0 | 1K | 3K |

## Sprint Preview Post-S5

| Sprint | Semaine | Focus |
|--------|---------|-------|
| S6 | 13-14 | B2B Foundation (multi-tenancy, dashboard musee, commission) |
| S7 | 15-16 | AI avancee (Wikidata KB, User Memory, recommandations perso) |
| S8+ | 17+ | Growth (BPI France, EU grants, blog SEO, expansion multi-villes) |

## Sprint Log Template

```markdown
# Sprint [N] — [Nom]
## Dates: YYYY-MM-DD -> YYYY-MM-DD

### Jour 1 (YYYY-MM-DD)
**Fait:** [tache] — fichiers: `path/file.ts`
**Bloque:** [issue] — attente: [dependance]
**Decision:** [quoi + pourquoi]

### Retro Sprint
- **Bien:** ...
- **Mal:** ...
- **A changer:** ...

### Metriques fin de sprint
Tests: X backend, Y frontend | Coverage: X% | Note store: X.X | MAU: X
```
