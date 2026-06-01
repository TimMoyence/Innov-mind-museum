# Cartographie 360 — Realite de la couverture de tests BACKEND (museum-backend)

Date: 2026-05-31. Auditeur: subagent tests-backend. Methode: echantillonnage ~20 fichiers + lecture config gates/CI + verification path:line. Doctrine UFR-013 : chaque affirmation ci-dessous est verifiee par Read/Grep/Bash, pas par memoire.

## Verdict synthetique

La couverture backend est **reelle et de qualite inhabituellement haute pour un solo-dev assiste-IA**, pas du theatre de mocks. Trois piliers structurels la rendent credible : (1) les tests d'integration/e2e tournent sur un **vrai Postgres testcontainer** avec migrations appliquees, (2) le **mutation testing Stryker** est cable en CI avec un gate hot-files qui `exit 1`, (3) le ratio de tests purement-mock est faible (10/551 fichiers unit). La zone aveugle materielle : le **pipeline LLM live + guardrails V2** n'est PAS exerce dans les e2e (orchestrateur stub), il dependait d'un CI promptfoo separe et de tests AI gated.

Maturite estimee: **78/100**.

## Forces (preuves)

### F1 — Integration/e2e sur vraie DB (pas de SQLite/mock-repo)
`tests/helpers/integration/integration-harness.ts:71` fait `AppDataSource.runMigrations({ transaction: 'none' })` sur un **Postgres testcontainer** par worker Jest (`startPostgresTestContainer`, import L1-5). `reset()` (L73-90) fait un vrai `TRUNCATE ... RESTART IDENTITY CASCADE` et seed des museums 42/99 pour les tests BOLA multi-tenant. C'est de la persistance reelle, pas un repo en memoire.

### F2 — Audit hash-chain teste comportementalement avec re-calcul independant
`tests/unit/audit/audit-chain.test.ts` (261 lignes) : detecte mutation d'un champ (L25-35), suppression de ligne / prev_hash casse (L37-46), row_hash falsifie (L48-55). Surtout, L142-159 **re-calcule le SHA-256 attendu a la main** (`createHash('sha256').update(expectedPayload)`) au lieu de re-mocker la fonction — kill du mutant reversed-sort. Plusieurs tests sont explicitement des "mutation kill tests" (L87-260) ciblant `<`→`<=`, `+1`→`-1`, `hex`→`base64`. C'est l'oppose du tautologique.

### F3 — DSAR / RGPD export teste end-to-end avec assertions sur l'etat reel
`tests/e2e/dsar.e2e.test.ts` boote le harness Postgres complet, seed un dataset utilisateur complet, frappe `GET /api/users/me/export` (L36), assure schemaVersion=3, le nombre exact de consent records / chat sessions / messages / reviews / tickets (L45-67), et inclut un cas **anti-IDOR** (L94-121 : un `userId` en query param est ignore, le dossier renvoye est celui du caller). Plus rate-limit 1/7j (L129). Vrai parcours conformite.

### F4 — Mutation testing Stryker = gate CI reel, pas decoratif
`.github/workflows/ci-cd-backend.yml:458-481` : Stryker incremental sur push/PR (`pnpm run mutation:ci`), full nightly, puis **`pnpm run mutation:gate`** (= `scripts/stryker-hot-files-gate.mjs`). Ce script fait `process.exit(1)` si un hot file passe sous son `killRatioMin` (`scripts/stryker-hot-files-gate.mjs:98-118`). `.stryker-hot-files.json` epingle 8+ fichiers banking-grade a killRatio>=80 : art-topic-guardrail, cursor-codec (IDOR), sanitizePromptInput, audit-chain, llm-circuit-breaker, refresh-token repo, session-issuer. Le scope mute est cible et documente (`stryker/module-chat-guardrails.config.mjs`). PHASE_HISTORY.md L36 (verifie) : rapport reel Killed=1387/Timeout=3190/Survived=28, covered-only 99.39%.

### F5 — V1 keyword guardrail teste exhaustivement
`tests/unit/chat/art-topic-guardrail.test.ts` : 61 assertions `toEqual` sur la sortie reelle du classifieur (insult/prompt_injection/off-topic), pas des spies. ~15 variantes d'injection distinctes (L96-202).

### F6 — Ratio theatre faible + securite/multi-tenant teste sur DB
Sur 551 fichiers unit, seulement **188 utilisent jest.mock** (66% sont pure-behavior), et seulement **10 sont 100% interaction-assertion**. Spot-check de ces 10 (`chat-session-service-intent.test.ts`, `redeliver-brevo-erasure.test.ts`) : legitimes (forwarding de contrat / routing erasure->removeContact, mock approprie d'un SDK externe Brevo). `tests/integration/security/idor-matrix.test.ts` + `ssrf-matrix.integration.test.ts` frappent le vrai serveur Express+PG et asserent les codes 404/403 cross-user.

### F7 — Chaos + erasure cascade reels
`tests/e2e/chaos-*.e2e.test.ts` (redis-down, circuit-breaker, llm-provider, bullmq-worker) ; `tests/integration/auth/deleteAccount-cascade.int.test.ts` + 5 tests unit deleteAccount (audit-twophase, erasure-chain, image-cleanup, brevo-fallback).

## Faiblesses & zones aveugles

### W1 (CRITIQUE pour le faux sentiment de securite) — Pipeline LLM live + guardrails V2 NON exerce en e2e
`tests/helpers/e2e/e2e-app-harness.ts:316-327` : le ChatService e2e recoit un **orchestrateur synthetique** (`text: 'Synthetic assistant response for e2e'`) sauf override explicite. `OPENAI_API_KEY = 'e2e-fake-openai-key'` (L213). Donc les e2e chat couvrent HTTP/auth/persistance/V1-guardrail mais **PAS** : la generation LLM reelle, le V2 LLM Guard sidecar, le LLM judge, l'output guardrail sur reponse reelle. Ces couches dependent de (a) tests AI **gated** (`describe.skip` si `RUN_AI_TESTS` absent — `tests/ai/guardrail-live.ai.test.ts:3`) qui ne tournent que si chat/guardrail change en PR, et (b) un CI promptfoo separe (`llm-security-promptfoo.yml`, cron). Risque : une regression du chainage guardrail->LLM->output qui ne casse aucun stub passe les e2e en vert.

### W2 (MEDIUM) — Coverage gate global = baseline figee aux actuals, pas une cible exigeante
`jest.config.ts:137-140` : seuils **88 stmt / 74 br / 86 fn / 89 lines**, re-pinnes "aux SWC-jest actuals" a chaque drift (commentaire L105-145 documente plusieurs abaissements : 75->74 branches le 2026-05-10, pin au floor apres suppression d'un test). C'est un cliquet anti-regression, pas un gate qui pousse vers le haut. Le signal load-bearing est explicitement deplace sur Stryker (ADR-007 cite L126). Donc le % coverage global NE prouve PAS la qualite — il faut lire Stryker pour ca. Acceptable mais a ne pas survendre.

### W3 (MEDIUM) — Mutation report sur disque date du 16 mai ; le gate depend du nightly
`reports/mutation/mutation.json` mtime = 16 mai. Le gate CI re-genere en incremental, mais le scope mute reste limite aux hot-files + modules carve-out : **les 28 survivors** (PHASE_HISTORY L36) sont un backlog assume, et tout fichier hors `.stryker-hot-files.json` / hors configs `stryker/module-*` n'a **aucun** plancher mutation. La majorite du code n'est donc couverte que par le coverage-lines (W2), pas par mutation.

### W4 (LOW) — Timeout=3190 >> Killed=1387 dans le rapport
Documente dans CLAUDE.md (gotcha "Stryker label Timeout = souvent vrai kill", open-handles BullMQ/ioredis). C'est explique et la metrique reste fiable selon la doctrine, mais un lecteur externe verrait 3190 Timeouts et douterait — la robustesse repose sur la confiance dans l'explication open-handle, non sur des kills francs.

### W5 (LOW) — tests/load, tests/perf, tests/mutation-killers quasi-vides
`tests/load/chat-spike.k6.js` (1 fichier k6, hors Jest), `tests/perf/chat-load.mocked.ts` (mocked), `tests/mutation-killers/README.md` seul. La perf/charge n'est pas reellement testee en CI — coherent avec un pre-launch B2C solo, mais les 646 ".test.ts" annonces excluent ces dossiers (0 .test.ts dedans).

## Preuves de commandes

- Comptes: unit 551 / integration 63 / e2e 23 / contract 5 / ai 4 ; total 646 `.test.ts`.
- jest.mock dans 188/551 unit ; 10 fichiers 100% interaction-assertion.
- Gate hot-files: `scripts/stryker-hot-files-gate.mjs:118` `process.exit(1)`.
- e2e LLM stub: `tests/helpers/e2e/e2e-app-harness.ts:318` `text: 'Synthetic assistant response for e2e'`.

## Affirmations a verifier adversarialement
1. Le CI promptfoo (`llm-security-promptfoo.yml`) tourne-t-il REELLEMENT sur PR touchant chat/guardrail, ou seulement en cron (auquel cas W1 est plus grave) ?
2. Le job Stryker CI peut-il echouer une PR, ou est-il `continue-on-error`/non-bloquant ?
3. Les 28 survivors Stryker incluent-ils un hot file de securite, ou seulement du code non-critique ?
4. Le coverage-merge nyc check applique-t-il vraiment les seuils sur l'union des 4 shards (sinon le gate global est cosmetique) ?
5. Les tests AI gated (`RUN_AI_TESTS`) ont-ils deja tourne en CI recemment, ou sont-ils skip de facto en permanence ?
