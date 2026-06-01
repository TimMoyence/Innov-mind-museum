# Testing Strategy — État de l'art enterprise vs Musaium

_Cartographie 360 — 2026-05-31. Sources web autoritatives 2020-2026, claims Musaium vérifiés-code._

## 1. État de l'art (SOTA)

### Test pyramid vs Testing Trophy
Le **test pyramid** (Cohn) reste le défaut des monolithes (61 % des équipes monolith d'après l'enquête web.dev), mais privilégie les unit tests au point de laisser des trous d'intégration. Le **Testing Trophy** de Kent C. Dodds (2018) rééquilibre : base = **analyse statique** (types, lint), corps = **integration tests** (meilleur ROI), pointes fines unit + e2e. La maxime « write tests, not too many, mostly integration » oriente l'effort vers la confiance/utilisateur plutôt que le nombre. En 2024-2026 le choix corrèle avec l'architecture : serverless/FaaS → trophy (42 %), microservices → honeycomb/risk-based. Aucun modèle n'est universel ; le critère est le ROI par couche, pas la forme géométrique.
Sources : [Kent C. Dodds — Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications), [web.dev — Pyramid or Crab?](https://web.dev/articles/ta-strategies), [Test Pyramid vs Trophy (Baytech)](https://www.baytechconsulting.com/blog/test-pyramid-vs-testing-trophy-whats-the-difference).

### Coverage gates
Consensus fort : **la couverture est un indicateur, pas un objectif** (loi de Goodhart). Google publie des guidelines — 60 % « acceptable », 75 % « commendable », 90 % « exemplary » — mais **déconseille les gates uniformes par fichier** : tous les fichiers n'ont pas la même valeur, et viser 100 % draine l'ingénierie pour un gain marginal. Bonne pratique : gate sur le **code nouveau/diff** plutôt que global, et mutation testing pour mesurer la *qualité* des tests, pas leur volume.
Sources : [Google Testing Blog — Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html), [Codecov — Case Against 100 %](https://about.codecov.io/blog/the-case-against-100-code-coverage/), [Qt — 70/80/90/100 %](https://www.qt.io/quality-assurance/blog/is-70-80-90-or-100-code-coverage-good-enough).

### Mutation testing
Reconnu comme la mesure la plus rigoureuse de l'efficacité des tests (un test qui passe sur du code muté = test inutile). Adopté en cœur de système chez Google/Netflix, peut réduire les défauts échappés ~20 % (études citées). Mais coûteux → scope ciblé (cache-first, modules critiques) est la pratique recommandée plutôt que full-repo. Stryker = standard JS/TS avec quality gates CI configurables.
Sources : [Stryker Mutator docs](https://stryker-mutator.io/docs/), [Mutation Testing Explained (upnxtblog)](https://www.upnxtblog.com/index.php/2025/05/05/mutation-testing-explained-boost-software-quality-with-smarter-test-coverage/).

### Contract testing
**Consumer-Driven Contracts (Pact)** = standard pour découpler consommateur/fournisseur : le consommateur génère le contrat depuis ses tests, le fournisseur le vérifie en CI → déploiement indépendant sans e2e full-stack. Distinct d'une validation de schéma provider-side (OpenAPI response check) qui ne capture pas les *attentes réelles* du consommateur.
Sources : [Pact Docs](https://docs.pact.io/), [Microsoft Engineering Playbook — CDC](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/cdc-testing/), [Pactflow — CDC](https://pactflow.io/what-is-consumer-driven-contract-testing/).

### Flaky test management
Google : ~16 % de la suite a montré de la flakiness à un moment. Pratique enterprise = **détection automatique (re-run 5-20×) + quarantaine** (le test tourne mais ne casse plus le pipeline) + bug ownership + tracking du *taux* de flakiness. Cible e2e mobile : **flake rate < 2 %**, archiver screenshots/vidéos des échecs.
Sources : [Google Testing Blog — Flaky Tests](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html), [Trunk.io — Eradicating flaky tests](https://trunk.io/blog/eradicating-flaky-tests), [Maestro — E2E Best Practices 2025](https://maestro.dev/insights/end-to-end-testing-best-practices-complete-2025-guide).

### Property-based testing
fast-check (JS/TS) génère des entrées aléatoires + shrinking vers le contre-exemple minimal ; a trouvé de vrais bugs dans react, jest, io-ts (Unicode, validation email multi-@). Idéal pour parsers/validateurs/sanitizers/sérialisation — précisément les surfaces les plus pertinentes côté guardrail/sanitization.
Sources : [fast-check — Why PBT](https://fast-check.dev/docs/introduction/why-property-based/), [howtogeek — generate thousands of tests](https://www.howtogeek.com/how-i-rapidly-generate-thousands-of-tests-to-catch-stealthy-bugs/).

### Mobile e2e
Maestro = flow-driven black-box, setup minimal, faible flakiness, sharding CI ; Detox = gray-box auto-synchronisé (moins flaky mais setup lourd). Best practices : dynamic waits + stable selectors, intégration CI, screenshots sur échec, flake < 2 %.
Sources : [Maestro vs Detox (Jupiter)](https://life.jupiter.money/choosing-between-maestro-and-detox-on-jupiter-qa-automation-7b94e6f8759d), [QA Wolf — Best Mobile E2E 2026](https://www.qawolf.com/blog/best-mobile-app-testing-frameworks-2026).

## 2. Comparaison Musaium (vérifié-code)

| Axe | Musaium | SOTA | Verdict |
|---|---|---|---|
| Volume | 646 BE + 361 FE + 44 Maestro (`.maestro/*.yaml`) | — | Solide pour solo IA-assisté |
| Modèle | Hexagonal BE (unit+integration+e2e), FE feature-driven, trophy implicite (tsc+ESLint base) | Trophy/pyramid hybride | **SOTA-aligné** |
| Coverage gates | ADR-007 (`docs/adr/ADR-007-coverage-gate-policy.md`) | gate diff > gate global | À confirmer : gate sur diff vs global |
| Mutation testing | Stryker, scope **cache-first V1** (D3 lockée) | scope ciblé recommandé | **SOTA** — scoping discipliné |
| Contract testing | `test:contract:openapi` = **validation schéma provider-side**, pas Pact | CDC consumer-driven | **GAP partiel** — pas de contrat piloté consommateur |
| Property-based | fast-check présent mais **1 seul fichier** (`tests/unit/shared/validation/sanitize-prompt-input.property.test.ts`) | étendre aux parsers/validateurs | **Sous-exploité** |
| Chaos | e2e réels (`chaos-circuit-breaker.e2e.test.ts`, `chaos-bullmq-worker.e2e.test.ts`, `resolve-chaos-rate`) | résilience injectée | **SOTA** — au-delà de la médiane |
| Flaky mgmt | Pas de quarantaine/détection auto trouvée ; retries applicatifs ≠ retries de test | détection+quarantaine+flake-rate | **GAP** |
| Mobile e2e | Maestro + sharding CI (4 shards) + UFR-021 (écran→flow) | Maestro = bon choix | **SOTA**, discipline UFR-021 supérieure à la médiane |
| Discipline | Factories DRY obligatoires, UFR-022 fresh-context red/green + frozen-test, sentinelles (22 dans `scripts/sentinels/`) | rare en industrie | **Au-dessus du SOTA** |

**Positionnement** : pour une équipe solo IA-assistée, le dispositif dépasse la médiane enterprise sur mutation scoping, chaos, discipline anti-rubber-stamp (UFR-022) et la règle écran→flow (UFR-021). Gaps réels et chiffrables : (a) pas de contract testing consumer-driven entre FE/web et BE (le check OpenAPI ne couvre que la conformité de réponse, pas les attentes consommateur) ; (b) property-based testing limité à 1 fichier alors que les surfaces guardrail/sanitization/geo-parsing sont des candidats idéaux ; (c) aucune gestion de flakiness systématique (détection re-run + quarantaine + suivi flake-rate), risque réel sur 44 flows Maestro device-dependent à l'approche launch.

## 3. Recommandations priorisées

- **P1 — Quarantaine + flake-rate tracking Maestro.** Re-run automatique des flows échoués (2-3×) en CI, label `quarantine` non-bloquant + bug, et suivi du flake-rate (cible < 2 %). Évite qu'un flow flaky bloque le launch ou érode la confiance. Faible coût (config CI), fort ROI pré-launch.
- **P1 — Étendre property-based testing.** Porter fast-check au-delà de `sanitize-prompt-input` : `LocationResolver`/reverse-geocoding, parsing jsonb (cf. gotchas drift), validation DOB/i18n (bug DOB-2026-05-17), guardrail keyword. Surfaces déterministes à fort taux de bugs cachés.
- **P2 — Contract testing consumer-driven léger.** Avant Pact full, snapshot des types OpenAPI consommés réellement par FE/web + diff CI bloquant (déjà amorcé via `check:openapi-types`) ; formaliser en contrat versionné. Pact complet = LATER (1 producteur, 2 consommateurs internes → ROI modéré en V1).
- **P2 — Documenter le scope coverage ADR-007.** Vérifier/expliciter gate-sur-diff vs global pour rester aligné Google (éviter Goodhart). Couplé au mutation score cache-first comme indicateur de *qualité* publié.
