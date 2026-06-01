# Audit 06 — Sécurité & AI-Safety (Musaium)

Date: 2026-05-31. Auditeur: subagent cartographie 360. Méthode: échantillonnage code réel + CI, citation `path:line`. Distinction défense **réelle** (code exécuté) vs **déclarative** (commentaire/doc).

## Verdict

Posture sécurité **mature et largement non-déclarative** pour un solo-dev pré-launch. Le pipeline chat defense-in-depth existe vraiment, l'ordering décrit dans CLAUDE.md est respecté ligne par ligne, les fail-modes (closed/open) sont implémentés ET documentés au bon endroit. SAST (CodeQL + Semgrep), signing (cosign + SLSA), sentinelles secrets et tests adversariaux sont actifs. Faiblesses = surface d'activation conditionnelle (V2 layers no-op si env non set) + un mode observe-only qui peut neutraliser la couche sidecar sans changer le code.

## 1. Pipeline chat defense-in-depth — VÉRIFIÉ (6 couches réelles)

L'orchestration vit dans `museum-backend/src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts`. Ordering input prouvé:

1. **V1 keyword guardrail** — `evaluateUserInputGuardrail({ text })` appelé en PREMIER (`guardrail-evaluation.service.ts:131`). Hard blocks (insultes/injection/jailbreak) court-circuitent avant tout (`:132-143`). Source `art-topic-guardrail.ts` (257 lignes, 15 occurrences inject/jailbreak/ignore — substance réelle, pas un stub).
2. **Input sanitization** — `sanitizePromptInput()` (`shared/validation/input.ts:11`): NFC normalize + strip zero-width/control + truncate 200. Appliqué sur `location` (`llm-sections.ts:290`) et `title` (`llm-prompt-builder.ts:73`). Réel.
3. **Prompt isolation structurelle** — marqueur `[END OF SYSTEM INSTRUCTIONS]` poussé (`llm-prompt-builder.ts:174`), system/section AVANT user content. Présent dans walk-tour-guide + judge.
4. **V2 LLM Guard sidecar fail-CLOSED** — `llm-guard.adapter.ts`. `scan()` fail-CLOSED sur breaker OPEN (`:266`), overflow sémaphore (`:284`), HTTP ≥400 (`:385`), JSON malformé (`:392`), timeout/network (`:402`). `failClosed()` (`:412`) retourne `allow:false`. Circuit breaker + sémaphore + chaos injection = robuste (ADR-047). Appelé APRÈS keyword, jamais en remplacement (`guardrail-evaluation.service.ts:145-151`).
5. **V2 LLM judge fail-OPEN** — `eval/v2-layers.helper.ts:33`. `runLlmJudge` ne tourne que si `llmJudgeEnabled` ET texte > `judgeMinMessageLength`; `if (!decision) return {allow:true}` = fail-open explicite (`:43`). Floor confiance 0.6. Peut UNIQUEMENT downgrade allow→block.
6. **Output guardrail** — `evaluateOutput` (`:264`): keyword sur texte agrégé (réponse + captions + rationales via `aggregateOutputText`) PUIS provider sidecar (`:295`). O3 LLM classifier retiré (C9.9, ADR-015 amendment) — documenté honnêtement.

Les 2 V2 layers sont structurellement indépendants (dep getters séparés `providerDeps()`/`judgeDeps()`, `:76-88`) conformément à ADR-015.

## 2. Tests adversariaux — RÉELS

- `tests/unit/security/prompt-injection.test.ts`, `bruteforce-login.test.ts`, `stored-xss.test.ts`.
- `tests/integration/security/idor-matrix.test.ts`, `ssrf-matrix.integration.test.ts`, `auth-email-service-kind-prod-reject.test.ts`.
- `tests/ai/guardrail-live.ai.test.ts` + dataset `tests/fixtures/guardrails-dataset.json`.
- CI: `llm-security-promptfoo.yml` — OWASP LLM07 system-prompt-leak, ~85 prompts × 8 locales × 10 familles, fail si pass-rate < 95 %, cron Mon 04:00 + PR sur chat/guardrail. `llm-promptfoo-smoke.yml` (over-blocking catch), `ci-cd-llm-guard.yml`. Corpus régénéré fresh avant run (anti-drift).

## 3. Auth — VÉRIFIÉ

- **Denylist fail-OPEN** (ADR-064): `redis-access-token-denylist.ts:76-85`, `has()` retourne `false` sur erreur Redis. Documenté `:37-39` comme défense-in-depth, pas couche primaire. Middleware `authenticated.middleware.ts:51-54` câblé, défaut no-op si pas de Redis. Trade-off assumé.
- JWT + refresh rotation, MFA web-admin-only (mobile retiré UFR-016), tokens device-bound (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) — cohérent CLAUDE.md.
- BOLA/IDOR: sentinelle `idor-smoke.mjs` exécute la matrice integration, exit 1 si red (`:48-49`). Auto-skip si fichier absent (correct).

## 4. Secrets & supply-chain — VÉRIFIÉ

- `DB_SYNCHRONIZE` hard-throw en prod (`data-source.ts:36`) + gate CI `ci-cd-backend.yml:174-177` (grep sur `.env*`).
- `env-policy.mjs` bloque env files non-whitelistés + patterns secrets (`:78,:94`, exit 1 `:102`).
- `wellknown-placeholder-free.mjs` bloque `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` / `DO_NOT_SHIP` (`:38`, exit 1 `:107`).
- Signing: cosign sign + SLSA L3 attest + cosign verify inline (`ci-cd-backend.yml:942-955`), `cosign-sign-image.yml`, `cosign-verify-deploy.yml`, `sbom-attest-check.mjs`.

## 5. RGPD — RÉEL (nuance terminologique)

- Erasure Art.17: `deleteAccount.useCase.ts` orchestre S3 images → S3 audio → Brevo (avec outbox `brevo_erasure` lead si 5xx, R5) → leads `deleteByEmail` → DB cascade. **Best-effort** par étape externe (R17). audit_logs RETENUS (obligation légale, hash chain immuable) — choix documenté `:50-52`. NB: ce n'est PAS un soft-delete à grace-period; "two-phase" en mémoire réfère à l'audit commit + leads outbox, pas à une suppression différée.
- Audit chain: `audit-chain.ts` computeRowHash + prevHash verify (`:81`), serialization via `pg_advisory_xact_lock` (`audit.repository.pg.ts:11-14`).
- Langfuse masking (ADR-063): `langfuse.client.ts:68` `mask: stripFreeText` appliqué SDK-level avant transport.
- Subprocessor ledger: `SUBPROCESSORS.md` + sentinelle `subprocessor-ledger-completeness.mjs` + page web + test.

## 6. SAST — ACTIFS

- `codeql.yml` — pull_request + push + cron daily 03:30.
- `semgrep.yml` — cron daily 04:30, configs `p/owasp-top-ten` + js/ts/nodejs, scan backend/frontend/web, `--error` (bloquant).

## Faiblesses & risques

1. **[MEDIUM] V2 layers inactifs si env non provisionné.** LLM Guard sidecar n'existe que si `GUARDRAILS_V2_LLM_GUARD_URL` set (`chat-module.ts:478`); judge que si `budgetCentsPerDay > 0` (`:847`). En prod sans ces vars → seul V1 keyword + output keyword tournent. Pas de gate CI vérifiant que la prod a bien le sidecar branché. **Fausse impression de couverture** si on lit "6 couches" sans vérifier l'activation runtime.
2. **[MEDIUM] Observe-only neutralise le sidecar sans diff code.** `GUARDRAILS_V2_OBSERVE_ONLY=true` (`env.ts:402`) downgrade tout block sidecar en allow (`v2-layers.helper.ts:92-105`). Défaut `false` (enforce) = bon, mais un flip env silencieux ouvre la couche 4. À monitorer.
3. **[LOW] Denylist fail-open** = compromis légitime mais signifie qu'une panne Redis rouvre une fenêtre de réutilisation de token révoqué jusqu'à expiration JWT. Acceptable car rotation refresh, mais à connaître.
4. **[LOW] Erasure best-effort swallow.** Échec S3/Brevo loggé+avalé, cascade DB continue. Le lead outbox couvre Brevo; mais un échec S3 silencieux pourrait laisser des images résiduelles sans retry visible (à confirmer cron de nettoyage S3).

## Claims à vérifier adversarialement
- "6 couches actives en prod" — vérifier env prod a `GUARDRAILS_V2_LLM_GUARD_URL` + `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY > 0`, sinon 4 couches seulement.
- "fail-CLOSED total sidecar" — confirmé code, mais dépend de l'activation (point 1).
- promptfoo pass-rate < 95 % bloque vraiment la PR (paths trigger limités à chat/llm — un bypass via autre chemin ne déclenche pas le gate sur PR).
- Erasure S3 couvre tous les key-layouts (le code admet "native scan alone cannot reach every key layout").
