# Prompts de remédiation — fresh sessions (issus de la Cartographie 360°, 2026-05-31)

Chaque bloc = un prompt à coller dans une **session fresh** de Claude Code dans ce repo.
Source de vérité des constats : `audit-state/2026-05-31-cartographie-360/CARTOGRAPHIE-360.md` + `raw/01..16-*.md`.

## Ordre de passage recommandé (anti-collision)

| Ordre | Prompt | Fichiers touchés | Dépend de |
|---|---|---|---|
| libre | #1 Tests backend | `museum-backend/tests/**`, `src/**` | — (le seul en `/team`) |
| libre | #5 Docs honnêteté | `CLAUDE.md`, `docs/**` (doc only) | — |
| **1er** | #3 Hook frozen-test | `settings.json`, `lint-on-edit.sh` | — |
| après #3 | #6 Machinerie /team + lib-docs | `.claude/skills/team/**`, `.claude/agents/**` | #3 (hook câblé) |
| **1er** | #2 Sentinelles + workflows CI | `scripts/sentinels/**`, `.github/workflows/*.yml` | — |
| après #2 | #4 Required checks + branch protection | `gh api` + `ci-cd-backend.yml` (ligne `needs` de deploy-prod) | #2 (jobs réparés) |

#3↔#6 et #2↔#4 partagent des fichiers → **séquentiel**, pas en parallèle.

---

## #1 — Couverture de tests backend

```
Tu es dans le repo Musaium (museum-backend). Un audit 360 du 2026-05-31 a noté la dimension "tests backend" 66/100. Avant toute action, LIS et re-vérifie : audit-state/2026-05-31-cartographie-360/raw/01-tests-backend.md et la section §3 dim.1 de audit-state/2026-05-31-cartographie-360/CARTOGRAPHIE-360.md. Ne fais pas confiance aveugle aux numéros de ligne — relis le vrai code.

Constats à traiter :
- [CRITIQUE] Le pipeline LLM live + guardrails V2 (sidecar, judge, output) n'est PAS exercé en e2e : l'orchestrateur est stubbé (tests/helpers/e2e/e2e-app-harness.ts:317 "Synthetic assistant response for e2e" + OPENAI_API_KEY="e2e-fake-openai-key"). Zone aveugle réelle.
- Le coverage gate global est une baseline figée re-pinnée aux actuals (cliquet anti-régression, pas une cible) — jest.config.ts:137.
- Le plancher mutation se limite aux 8 hot-files (.stryker-hot-files.json) ; la majorité du code n'a aucun seuil mutation.

Objectif :
1. Combler la zone aveugle e2e : ajouter au moins un test e2e qui exerce le VRAI chemin guardrail (V1 keyword → input sanitization → isolation → output guardrail) en passant PAR les couches de garde, avec un LLM fake DÉTERMINISTE injecté au niveau du port (pas en court-circuitant l'orchestrateur). But : prouver qu'un prompt-injection/off-topic est bien bloqué end-to-end, pas seulement en unit.
2. Documenter et trancher la stratégie coverage-gate (cible exigeante vs cliquet) dans un court ADR ou note — décision, pas statu quo silencieux.
3. Évaluer l'extension du scope mutation à 1-2 modules critiques (chat/guardrail) et proposer (sans forcément l'imposer).

Hors-scope (autres sessions) : NE réactive PAS le job Stryker `if:false` en CI, NE touche PAS aux required checks / branch protection. Reste dans museum-backend/{tests,src}.

Contraintes : passe par /team (UFR-022, ça touche tests/+src). Factories DRY obligatoires (docs/TEST_FACTORIES.md). UFR-013 (vérifie avant d'affirmer, reporte les fails verbatim). Zéro bypass de hook. Frozen-test respecté.

Vérification avant de conclure : `cd museum-backend && pnpm test:e2e` (DB up) + `pnpm test` + `pnpm lint`. Montre les exit codes réels.
```

---

## #2 — Sentinelles + CI/CD Pipeline (niveau workflow/scripts)

```
Tu es dans le repo Musaium. Un audit 360 du 2026-05-31 a noté "Sentinelles" 71/100 et "CI/CD" 74/100. Avant d'agir, LIS et re-vérifie : raw/03-sentinelles.md, raw/08-cicd.md et §3 dim.3 + dim.8 de CARTOGRAPHIE-360.md. Re-vérifie chaque file:line dans le vrai fichier (ils ont pu bouger).

Constats SENTINELLES :
- `cache-key-parity` = théâtre : son test cible tests/contract/cache-key-parity.test.ts N'EXISTE PAS → la sentinelle SKIP-grace `exit 0` toujours mais apparaît verte (cache-key-parity.mjs:27).
- `sbom-attest-check` et `audit-factory-coverage` orphelins (aucun hook/CI) ; audit-factory-coverage n'a même aucun `process.exit(1)`.
- `doc-last-verified` et `subprocessor-ledger` sont CI-only (absents de .husky/pre-push) → invalidables localement avant push.
- Trous : aucune sentinelle a11y / rate-limit-quota / CSP / secret-rotation.

Constats CI/CD (niveau workflow YAML, PAS branch protection) :
- Job mutation Stryker `if: false` (ci-cd-backend.yml:141 + le job lui-même) → soit RÉARMER (régénérer le cache incrémental offline puis retirer if:false), soit REQUALIFIER explicitement "désactivé" partout (et corriger PHASE_HISTORY.md:36 qui prétend faussement "nightly enforce thresholds").
- `maestro-summary` (ci-cd-mobile.yml:377) tourne en `always()`, ne contient AUCUN step qui échoue, et `if(!issueNumber)return` → statut vert quoi qu'il arrive = faux vert structurel. Corrige-le pour remonter `failure` quand un shard contient FAIL.
- Le gate `quality` Expo Doctor 3/19 bloque le nightly mobile → corrige la cause pour que l'e2e tourne réellement.
- `screen-test-coverage.mjs:170,177` scanne le fichier entier sans strip des commentaires → compte des écrans commentés `SKIPPED` comme `covered`. Strip les commentaires YAML avant matching.

Objectif : réparer ou supprimer le théâtre (cache-key-parity), câbler les orphelins ou les retirer (UFR-016), étendre le câblage pre-push manquant, supprimer les faux verts (maestro-summary, screen-coverage), trancher Stryker (réarmer OU requalifier). Proposer (sans implémenter) les sentinelles manquantes prioritaires.

Hors-scope (autres sessions) : branch protection / required checks / `deploy-prod needs` = session #4 (n'y touche pas). Le hook frozen-test = session #3.

Contraintes : exempt /team (scripts + .github, pas de code applicatif) → session classique. UFR-013. Zéro bypass. Toute sentinelle modifiée doit être re-jouée et rester self-cohérente (un faux PASS est pire que pas de garde).

Vérification : lance chaque sentinelle modifiée à la main + un `git push --dry-run` mental (husky pre-push) ; montre les exit codes.
```

---

## #3 — Câbler le hook frozen-test (P0, effort S)

```
Tu es dans le repo Musaium. L'audit 360 du 2026-05-31 (§5 reco 1, §7 P0 #2, §3 dim.7) a établi que la garantie vedette UFR-022 "frozen-test infalsifiable byte-for-byte" est en réalité de l'honor-system non câblé. Re-vérifie d'abord en lisant : .claude/skills/team/SKILL.md (autour de la ligne 301 "frozen-test"), le script post-edit-green-test-freeze.sh (cherche-le sous .claude/), le hook actuellement câblé lint-on-edit.sh, et settings.json / settings.local.json (section hooks).

Constats :
- post-edit-green-test-freeze.sh existe et passe son --self-test (3/3) MAIS n'est jamais déclaré en PostToolUse → il ne tourne que si l'orchestrateur le relance à la main.
- lint-on-edit.sh (≈ lignes 28-35) lance `prettier --write` + `eslint --fix` sur les *.test.ts SANS lire red-test-manifest.json ni vérifier le sha256 → un reformatage diverge le hash silencieusement = bypass mécanique du gel (gap déjà documenté en interne).

Objectif (quelques lignes) :
1. Déclarer post-edit-green-test-freeze.sh en hook PostToolUse, matcher `Edit|Write`, ordonné AVANT lint-on-edit.sh (settings.json ou settings.local.json selon la convention du repo — vérifie laquelle est utilisée).
2. Patcher lint-on-edit.sh pour SKIP tout fichier listé dans red-test-manifest.json (ne pas reformater un test gelé).
3. Prouver le câblage : modifie volontairement un test présent dans un manifest → le hook doit STOP avec exit 1 sur mismatch sha256. Montre la sortie réelle. Puis annule la modif de test.

Hors-scope : ne touche ni aux workflows CI, ni aux sentinelles, ni au versioning lib-docs (session #6). Strictement le câblage du hook.

Contraintes : exempt /team (settings + shell). UFR-013. Zéro bypass. Re-lance `post-edit-green-test-freeze.sh --self-test` après modif.

Vérification : démontre exit 1 sur un cas réel de mismatch, et exit 0 sur un edit non-test.
```

---

## #4 — Required checks + branch protection (P0, effort S, config GitHub)

```
Tu es dans le repo Musaium. L'audit 360 du 2026-05-31 (§3 dim.8, §7 P0 #3) a relevé un gating merge/deploy plus laxiste que le pipeline ne le laisse croire. AVANT toute modification : confirme l'état RÉEL avec `gh api repos/{owner}/{repo}/branches/main/protection` (lis required_status_checks.contexts, enforce_admins, required_status_checks.strict) et relis dans ci-cd-backend.yml le `needs:` du job deploy-prod (~ligne 848) et la condition du job e2e (~ligne 489). Ne suppose rien — vérifie (UFR-013/UFR-018).

Constats attendus (à confirmer) :
- required checks = quality, ai-tests, CodeQL, semgrep, sentinel-mirror. ABSENTS : coverage-merge (pourtant dans le `needs` de deploy-prod !), integration, e2e, promptfoo, migration-drift.
- enforce_admins=false (admin bypasse tout), strict=false (PR non-rebasée mergeable → SHA divergent).
- deploy-prod ne `needs` QUE [quality, coverage-merge] ; e2e ne tourne pas sur push main.

Objectif :
1. ÉPINGLER integration / e2e / coverage-merge / promptfoo / migration-drift comme required checks.
2. enforce_admins=true ; strict=true.
3. Faire dépendre deploy-prod d'integration (et idéalement e2e sur main).

GARDE-FOU OBLIGATOIRE : avant de rendre un job bloquant, VÉRIFIE qu'il PASSE réellement aujourd'hui (notamment e2e et coverage-merge — l'audit signale l'e2e mobile et certains jobs instables). Si un job est cassé/flaky, NE l'épingle PAS encore : signale-le, propose l'ordre "réparer d'abord, épingler ensuite", et liste ce qui est sûr à épingler tout de suite. Épingler un job rouge = geler tout merge vers main.

Action outward-facing / quasi-irréversible : enforce_admins=true peut te bloquer toi-même. DEMANDE confirmation explicite à l'utilisateur avant d'appliquer les changements de branch protection. Montre le diff exact (état avant → après).

Hors-scope : ne modifie pas la LOGIQUE des jobs (session #2). Ici : branch protection (gh api) + la seule ligne `needs` de deploy-prod.

Contraintes : exempt /team. UFR-013. Confirme avant appliquer.

Vérification : `gh api .../protection` après changement + un PR de test pour voir les checks requis s'afficher.
```

---

## #5 — Documentation, honnêteté & fraîcheur

```
Tu es dans le repo Musaium. L'audit 360 du 2026-05-31 (§3 dim.4, §4 sujet 15) a relevé des écarts doc↔code qui violent UFR-013. Re-vérifie d'abord chaque écart EN LISANT LE VRAI FICHIER (ne fais pas confiance à l'audit ni à moi) : raw/04-docs-honnetete.md, raw/15-backend-prod.md.

Écarts à corriger (après vérification) :
- CLAUDE.md (§ Pièges connus, gotcha pgvector) affirme "Index IVFFlat avec vector_cosine_ops" — MAIS la migration AddArtworkEmbeddings.ts crée en réalité un index HNSW `halfvec_ip_ops` (m=16, ef_construction=64) sur halfvec(768). Le CODE est conforme au SOTA → c'est la DOC qui est fausse (risque d'erreur opérateur au rebuild). Corrige la doc.
- CLAUDE.md "TypeORM docs repo archived March 2026. v1.0 planned H1 2026" est stale : TypeORM v1.0.0 est sorti le 2026-05-19, le repo 0.3.x est archivé. Mets à jour.
- Drifts mineurs à vérifier/corriger : note "apiPut api.ts:233" (réel ~:258) ; trace-propagation.middleware.ts vit sous observability/ pas middleware/ ; label roadmap "double" (CLAUDE.md) vs "triple" (DOCS_INDEX) ; ROADMAP_PRODUCT frontmatter done=97 vs prose "93 livré-vérifié".
- Ambiguïté basename : ROADMAP_PRODUCT.md:59 cite sentry-scrubber.ts:37-54, mais museum-backend/src/shared/observability/sentry-scrubber.ts fait 29 lignes (re-export pur) ; le vrai Set de 16 clés est dans packages/musaium-shared/src/observability/sentry-scrubber.ts (256 l.). Désambiguïse le path cité pour qu'un humain atterrisse au bon endroit.
- doc-last-verified couvre 6/154 docs (by-design opt-in) : évalue s'il vaut le coup d'étendre la liste aux ADR critiques + AI_SAFETY ; propose, n'impose pas.

Objectif : corriger chaque écart, faire en sorte que toute référence path:line citée RÉSOLVE.

Hors-scope : NE touche AUCUN code applicatif (doc only). Pure-doc → exempt /team.

Contraintes : UFR-013 + UFR-018 (vérifie le code/les configs avant d'écrire). Chaque path:line corrigé doit pointer juste.

Vérification : `node scripts/sentinels/roadmap-claim-resolves.mjs` doit PASS ; relis chaque référence corrigée.
```

---

## #6 — Machinerie /team (5-phase) + frozen-test + lib-docs versionné

```
Tu es dans le repo Musaium. L'audit 360 du 2026-05-31 (§3 dim.7, §5 verdict "HYBRID", raw/07-machinerie-team.md, raw/11-team-vs-anthropic.md) a établi que le skill /team a une plus-value réelle mais marginale : ~80% du pipeline 5-phase duplique le plugin officiel "superpowers" + la sémantique native des subagents ; la valeur non-native se réduit à frozen-test + lib-docs versionné.

PRÉREQUIS : le câblage PostToolUse du hook frozen-test + le skip *.test.* dans lint-on-edit.sh sont traités en session #3. Vérifie qu'il est fait (lis settings.json) ; si ce n'est PAS fait, signale-le et NE le refais pas ici (évite la collision) — concentre-toi sur le reste.

Objectifs :
1. lib-docs versionné — vérifie que lib-docs/INDEX.json tient réellement son contrat (sha256 snapshot/patterns, version vs package.json, fetched date). Confirme que le refresh forcé (stale >14j OU version drift OU manquant) fonctionne vraiment et n'est pas honor-system ; si le verifier hook pre-phase-doc-reference-check.sh existe, vérifie qu'il est câblé. Corrige le câblage manquant.
2. Drift modèle — les frontmatter d'agents pinnent claude-opus-4-7 (≈8 occurrences) alors que l'environnement tourne opus-4-8. Aligne.
3. Élagage (DÉCISION utilisateur, pas suppression unilatérale) — présente une analyse : agents doc-fetcher/doc-curator/learning-curator (sur-découpage ?), verifier/security (chevauchent le two-stage review ?). Pour chaque, dis "garder/fusionner/supprimer" avec le pourquoi. NE supprime qu'après accord (UFR-016 s'applique seulement une fois la mort actée).
4. Décision stratégique — propose (sans imposer) un plan d'alignement /team ↔ superpowers : adopter les skills officiels (TDD, subagent-driven-development, verification-before-completion) pour les 80% redondants, garder en custom UNIQUEMENT frozen-test câblé + lib-docs + l'intégration domaine Musaium (UFR, sentinelles, gates pnpm/tsc, roadmap). Chiffre le gain (lignes/agents/hooks supprimés).

Hors-scope : le câblage du hook frozen-test PostToolUse = session #3 (ne pas refaire). Aucun changement CI.

Contraintes : exempt /team. UFR-013. Présente les options d'élagage AVANT d'agir.

Vérification : `--self-test` des hooks team modifiés ; INDEX.json cohérent (re-hash) ; `grep -rn claude-opus-4-7 .claude/agents/` = 0 après alignement.
```
