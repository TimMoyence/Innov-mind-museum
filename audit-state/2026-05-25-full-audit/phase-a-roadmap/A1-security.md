# Phase A — Roadmap P0.A Security & PII (items A1–A9)

> Audit READ-ONLY fresh-context (UFR-022) — branche `dev` @ HEAD `89852f2a16ae4d8af3a5687f65325aa3bddd6269`.
> Méthode : vérif code par `Read`/`Grep` au HEAD courant (PAS confiance au marqueur). Paths:line reproductibles (UFR-024).
> Contexte : le findings D1 (`audit-state/2026-05-25-roadmap-reconstruction/findings/D1-lot1-security.md`) référençait `origin/p0/security` (branche pré-merge). LOT 1 sécurité a depuis été mergé sur `dev` via `e0aade002` (#293) ; A1/A2 via le LOT GDPR `71f103b35` (#294). Cet audit re-vérifie sur l'arbre `dev` mergé, post-62-commits-depuis-2026-05-21.

---

### P0.A1 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - Helper canonique présent : `museum-backend/src/shared/pii/extractEmailDomain.ts` (+ test `museum-backend/tests/unit/shared/pii/extractEmailDomain.test.ts`).
  - 3 sites in-scope patchés → `emailDomain` only :
    - `museum-backend/src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts:13` import, `:63` `const emailDomain = … extractEmailDomain(email)`, `:68`+`:78` `metadata: { emailDomain }`.
    - `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-password.route.ts:24` import, `:62` `metadata: { emailDomain: extractEmailDomain(email) }`.
    - `forgotPassword.useCase.ts` : pas de log d'email brut résiduel (grep `emailDomain|metadata` = 0 hit → ne logge pas d'email du tout dans ce useCase, conforme).
  - Follow-up documenté toujours présent (LOW, hors scope) : `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-email.route.ts:47` `metadata: { newEmail }` (email brut). Conforme à la note roadmap "auth-email.route.ts newEmail brut (LOW, hors scope)".
- CHECKBOX-FLIP : non (déjà ✅, vérifié exact).
- Amélioration/debt : `auth-email.route.ts:47` `newEmail` brut — appliquer `extractEmailDomain` ici aussi pour clore le résidu (LOW, debt mineure DRY+PII).

### P0.A2 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - Schéma : `museum-backend/src/modules/auth/adapters/primary/http/schemas/auth.schemas.ts:17` `dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, …)` — PAS de `.optional()` (champ requis).
  - useCase : `museum-backend/src/modules/auth/useCase/registration/register.useCase.ts:58` `this.assertDigitalMajority(input.dateOfBirth)` ; `:108-109` `if (!dateOfBirth) { throw badRequest('dateOfBirth is required'); }` — hard-throw 400, fallback `if(!dateOfBirth) return` SUPPRIMÉ.
  - Note : path réel du register useCase = `useCase/registration/register.useCase.ts` (sous-dossier `registration/`, le findings/roadmap citait `useCase/register.useCase.ts`). Même symbole.
- CHECKBOX-FLIP : non.
- Amélioration/debt : —

### P0.A3 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - `SENSITIVE_QUERY_KEYS` étendu : `packages/musaium-shared/src/observability/sentry-scrubber.ts:29` Set incluant `code` (`:33`), `email` (`:34`), `phone` (`:36`), `state` (`:39`).
  - Scrubber `event.tags` chokepoint : `sentry-scrubber.ts:220-232` — `scrubEvent` walk `next.tags` : header-shaped keys → `REDACTED` (`:223-224`), valeurs URL-like → `scrubUrl()` (`:227-228`). Va au-delà de `scrubRequest`/`scrubUser`/`scrubRecord(extra)`.
  - Wiring `beforeSend` : `museum-backend/src/shared/observability/sentry.ts:69` `beforeSend: (event) => scrubEvent(event …)`.
  - Source du leak couverte : `museum-backend/src/shared/middleware/error.middleware.ts:97,102,120` posent `path: req.originalUrl` comme tag → scrubbé par le chemin ci-dessus.
- CHECKBOX-FLIP : non.
- Amélioration/debt : —

### P0.A4 — VERDICT: DONE (conditionnel runtime — actif si `LANGFUSE_ENABLED=true`)
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - `museum-backend/src/shared/observability/langfuse.client.ts:68` `mask: stripFreeText` câblé au ctor (`:9` import depuis `./strip-free-text`).
  - Helper présent : `museum-backend/src/shared/observability/strip-free-text.ts` (fail-safe, commentaire R5 `:63-66`).
  - Le code est wiré inconditionnellement dans le ctor ; l'effet runtime dépend de `LANGFUSE_ENABLED` (default false en prod, hotfix 2026-05-17). Le wiring SDK (objet de l'item) est fait.
- CHECKBOX-FLIP : non.
- Amélioration/debt : `updateRoot:true` (`langfuse-langchain.ts`) reste — documenté intentionnel (mask central gère la PII). OK.

### P0.A5 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - Version dynamisée : `museum-frontend/app.config.ts:128` `version: (require('./package.json') as { version: string }).version` (commentaire `:122-126`).
  - Sentinel RÉEL présent : `scripts/sentinels/fe-version-sync.mjs` (repo-root `scripts/sentinels/`, PAS `museum-frontend/`). Test : `museum-backend/tests/unit/sentinels/fe-version-sync.test.ts`.
  - Confirme la correction de nom 2026-05-25 : `fe-version-sync.mjs` (et non `museum-frontend-version-sync.mjs` qui n'existe pas).
- CHECKBOX-FLIP : non.
- Amélioration/debt : —

### P0.A6 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - `museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:162-174` helper `checkCostBreakerOrThrow` : `if (!this.costBreaker.canAttempt()) { … throw new CircuitOpenError(); }` (fail-CLOSED).
  - Câblé au default path : `:333` `this.checkCostBreakerOrThrow('invokeSection'|…)` AVANT l'invocation LLM dans `generate()`.
  - `recordFailure()` HALF_OPEN probe câblé `:199` + `:504`.
  - Le claim "telemetry only / jamais appelé" est désormais FAUX (corrigé) : `canAttempt()` EST appelé.
- CHECKBOX-FLIP : non.
- Amélioration/debt : —

### P0.A7 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - `langchain.orchestrator.ts:557-558` — `generateWalk` (`:510`) appelle le même `this.checkCostBreakerOrThrow('generateWalk', …)` AVANT l'invocation structurée. Parité avec le default path.
  - Aussi `:556` `this.checkLatencyBreakerOrThrow('generateWalk', …)` (latency breaker) + `:504` `recordFailure()` dans le catch walk. Le walk path ne bypasse plus le cost containment.
- CHECKBOX-FLIP : non.
- Amélioration/debt : —

### P0.A8 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - Part (a) cost-breaker docstring : `museum-backend/src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts:6-10` réécrit factuellement — "(2) that no production caller invoked … (no caller checked `canAttempt()`). This run wires the missing guards". Plus de "PHASE 2 NOT WIRED" mensonger (grep = 0 hit sur ce phrasing).
  - Part (b) deleteAccount docstring : `museum-backend/src/modules/auth/useCase/account/deleteAccount.useCase.ts:62-63` "`chat_sessions` are removed first in {@link IUserRepository.deleteUser} (CASCADE → `chat_messages`)" — reflète la réalité CASCADE.
  - NOTE divergence findings D1 : le findings (lignes 39-42) marquait A8 PARTIAL car part (b) était byte-identique à la merge-base SUR `origin/p0/security`. Sur `dev` HEAD `89852f2a1`, part (b) EST corrigée → A8 désormais DONE complet. La correction est arrivée via le merge #293 sur dev (ou un commit ultérieur), postérieurement à l'état branche du findings.
- CHECKBOX-FLIP : non (déjà ✅ ; ce verdict CONFIRME le ✅ et infirme le PARTIAL du findings D1 — l'écart est dû à la ref branche obsolète du findings).
- Amélioration/debt : —

### P0.A9 — VERDICT: DONE (subsumé par A3)
- Marqueur roadmap actuel : ✅
- État réel vérifié :
  - `packages/musaium-shared/src/observability/sentry-scrubber.ts:33` `'code'` + `:39` `'state'` présents dans `SENSITIVE_QUERY_KEYS`. OAuth callback `code`/`state` désormais scrubbés.
  - A9 n'est pas un item distinct : sous-cas de A3 (même fix). Le claim "absents" était vrai à l'audit, corrigé.
- CHECKBOX-FLIP : non.
- Amélioration/debt : Au prochain rewrite roadmap, fusionner A9 dans A3 (redondance documentaire).

---

## Synthèse Phase A (A1–A9)

| Verdict | Count | IDs |
|---|---|---|
| DONE | 9 | A1, A2, A3, A4, A5, A6, A7, A8, A9 |
| OPEN | 0 | — |
| PARTIAL | 0 | — |
| FALSE-CLAIM | 0 | — |
| NOT-VERIFIABLE | 0 | — |

**Tous les items A1–A9 sont DONE sur `dev` @ `89852f2a1`, marqueurs ✅ exacts. AUCUN checkbox-flip nécessaire.**

**Écart notable vs findings D1** : A8 était marqué PARTIAL dans `D1-lot1-security.md` (part b non fixée sur `origin/p0/security`). Sur `dev` HEAD c'est DONE — le findings citait une branche pré-merge obsolète. Aucun item de la section A n'est en réalité ouvert.

**Améliorations/debt (mineures, non-bloquantes V1)** :
1. `auth-email.route.ts:47` — `newEmail` email brut dans audit metadata ; appliquer `extractEmailDomain` (LOW, clôt le résidu PII de A1).
2. Roadmap rewrite : fusionner A9 dans A3 (item non distinct).
3. A4 reste conditionnel runtime (`LANGFUSE_ENABLED`) ; le wiring code est fait, mais vérifier que le mask est actif si Langfuse est ré-activé en prod (default false aujourd'hui).
