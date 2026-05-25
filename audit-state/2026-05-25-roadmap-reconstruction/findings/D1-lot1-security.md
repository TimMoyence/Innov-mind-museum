# DOMAINE 1 — LOT 1 : Sécurité / PII @ `origin/p0/security`

> Ref vérifiée pour tous les items : **`origin/p0/security`** (commits uniques vs dev : `7c671f8da` "close P0 security/PII sweep — 12 items + ADRs 063/064/065" + `7902120db` fix test audio-consent). Merge-base avec dev = `f172ef63b`. La branche a exactement 2 commits propres ; dev est 43 commits devant.
> ADRs ajoutés sur la branche : `docs/adr/ADR-063-langfuse-mask-central-stripfreetext.md` (A4), `docs/adr/ADR-064-access-token-denylist-fail-open.md` (I-SEC7b), `docs/adr/ADR-065-redis-volatile-ttl-with-bullmq-caveat.md` (I-SEC1).
> Méthode : `git show origin/p0/security:<path>` + `git diff f172ef63b origin/p0/security` + roadmap de la branche (retenue comme "real shipped status" par le commit message).

---

- **P0.A3** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `packages/musaium-shared/src/observability/sentry-scrubber.ts:29-41` — `SENSITIVE_QUERY_KEYS` étendu à 11 entrées incluant `code`, `state`, `email`, `phone` ; `scrubEvent` (`:197-235`) traverse `next.tags` : header-shaped keys → `REDACTED`, valeurs URL-like → `scrubUrl()`. Le scrubber BE re-exporte ces symboles depuis `@musaium/shared` (`museum-backend/src/shared/observability/sentry-scrubber.ts:15`).
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 71). Reste P0 jusqu'au merge dev.
  - Confiance: haute

- **P0.A4** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/shared/observability/langfuse.client.ts:68` — `mask: stripFreeText` câblé au ctor du client Langfuse ; helper `strip-free-text.ts:83-147` scrub free-text LangChain shape, fail-safe try/catch (ligne 84/138), `STRIPPED` marker. `updateRoot:true` (`langfuse-langchain.ts:61`) documenté comme intentionnel (écrit input/output/tokens sur le span root, mask gère la PII en central). ADR-063 ajouté.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 72). Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.A5** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-frontend/app.config.ts:128` — `version: (require('./package.json') as { version: string }).version` (plus de littéral). Sentinel créé : `scripts/sentinels/fe-version-sync.mjs` (n'existait pas avant — claim doc confirmé), + test `museum-backend/tests/unit/sentinels/fe-version-sync.test.ts`.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 73). NB nom réel du sentinel = `fe-version-sync.mjs` (doc disait `museum-frontend-version-sync.mjs` — re-localisé, même fonction). Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.A6** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:163-176` helper `checkCostBreakerOrThrow` appelle `costBreaker.canAttempt()` et `throw new CircuitOpenError()` quand false (fail-CLOSED) ; câblé à l'entrée du default path `generate()` (`:333`). `recordFailure()` HALF_OPEN câblé (`:188-200`).
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 74). Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.A7** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:557` — `generateWalk()` appelle le même `checkCostBreakerOrThrow('generateWalk', …)` AVANT `structured.invoke`, + `recordFailure()` dans le catch autour de `invokeWalkStructured` (`:499`) si la probe HALF_OPEN échoue. Parité avec le default path.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 75). Reste P0 jusqu'au merge.
  - Confiance: haute

- **P0.A8** — Verdict: PARTIAL
  - Preuve: Partie (a) FIXÉE — `llm-cost-circuit-breaker.ts:1-31` réécrit : 0 hit sur "PHASE 2 PRIMITIVE, NOT WIRED" / "No production caller invokes recordCharge() yet", caller list factuelle + cite UFR-013 + RUN_ID. Partie (b) NON FIXÉE — `deleteAccount.useCase.ts:62-65` byte-identique à la merge-base `f172ef63b` (docstring "chat_sessions are removed first" inchangé) ; la roadmap de la branche elle-même (ligne 76) admet "Partie (b) reste ouverte, à traiter dans le run delete-account (out-of-scope C2)".
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ⚠️ (a) ✅ shipped / (b) ❌ reste P0 ouvert. Le texte roadmap est déjà honnête sur ce split ("shipped (a) — (b) backlog"). NB : sur le fond, le wording (b) en contexte numéroté (cleanup externe AVANT cascade DB) est défendable ; l'audit l'avait classé "partiellement faux" mais le fix n'a pas été appliqué sur cette branche.
  - Confiance: haute

- **P0.A9** — Verdict: DONE-BRANCH:origin/p0/security (FALSE-CLAIM-adjacent : subsumé par A3)
  - Preuve: `packages/musaium-shared/src/observability/sentry-scrubber.ts:33,39` — `code` et `state` présents dans `SENSITIVE_QUERY_KEYS`. Le claim "absents" était vrai au moment de l'audit ; corrigé par le même fix que A3. A9 n'est pas un item distinct, c'est un sous-cas de A3.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 77, "subsumed by P0.A3"). Fusionner avec A3 au rewrite.
  - Confiance: haute

- **I-SEC1** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/deploy/docker-compose.prod.yml:367-375` — service `redis` ajoute `--maxmemory ${REDIS_MAXMEMORY:-…}` + `--maxmemory-policy ${REDIS_MAXMEMORY_POLICY:-volatile-ttl}` avec commentaire "C4 I-SEC1". ADR-065 documente le caveat BullMQ no-TTL. Sentinel `scripts/sentinels/compose-parity.mjs` + test parity.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche). NB path réel = `museum-backend/deploy/docker-compose.prod.yml` (doc disait `deploy/docker-compose.prod.yml`). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC2** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:478-481` — `payloadBytesForContent` substitue un forfait fixe `VISION_BYTES_EQUIVALENT` (= `1000 tokens × 4 = 4000` bytes, `llm-cost-pricing.ts:61-62`) pour tout item `{type:'image_url'}` au lieu du byte-length base64 littéral. Source-agnostic (URL vs data-URL). Corrige l'inflation de la télémétrie + du breaker A6.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne I-SEC2). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC3** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:204-209` — `POST /art-keywords` chaîne désormais `isAuthenticated → requireRole(UserRole.ADMIN, UserRole.MODERATOR) → taxonomyWriteLimiter → handler`. Middleware `require-role.middleware.ts` créé (accepte super_admin implicite). Limiter 10/min per-user monté APRÈS le role gate (CLAUDE.md "Mutating middleware ordering").
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche). NB path re-localisé (doc disait `:184`, réel ~`:204`). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC5** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `admin-export.repository.pg.ts:19-60` — fallback littéral `'musaium-admin-export-v1'` RETIRÉ ; salt obligatoire (`throw` si unset, ligne 54). `env.production-validation.ts:159-171` ajoute la validation REQUIRED + ≥32 chars en prod (boot fail-fast). Test `admin-export.repository.pg.no-fallback.test.ts:58-60` asserte 0 occurrence du littéral dans la source. 3e site = `composition.ts:resolveExportPseudonymSalt`.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche, ligne 204). Cross-ref NOW small (DOMAINE 8 "EXPORT_PSEUDONYM_SALT mandatory"). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC7** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: (a) TOTP replay — migration `1779391176767-AddTotpLastUsedStep.ts` + `verifyMfa.useCase.ts:55-66` rejette `result.step <= lastStep` puis `markUsed(userId, now, result.step)` ; `totpService.ts:51-69` renvoie le step matché (RFC 6238 §5.2). (b) Access-token revocation — port `access-token-denylist.port.ts` + adapter `redis-access-token-denylist.ts` (fail-OPEN, ADR-064) consulté par `authenticated.middleware`, et `auth-session.route.ts:148-167` écrit le `jti` dans le denylist au logout (`verifyAccessTokenWithClaims`).
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC10** — Verdict: DONE-BRANCH:origin/p0/security
  - Preuve: `museum-backend/src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts:169-229` — bounded body reader 2-layer : (1) pre-fetch Content-Length check (`:187-188`, reject avant de consommer le body), (2) streamed cumulative-bytes cap avec `reader.cancel()` au-delà du cap (`:213-229`). Remplace `response.text()` non-gardé.
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ recoche (déjà ✅ sur la branche). Reste P0 jusqu'au merge.
  - Confiance: haute

- **I-SEC12** — Verdict: OPEN
  - Preuve: `museum-backend/package.json:72-79` — bloc `pnpm.overrides` ne contient NI `ws` NI `brace-expansion` (seulement langsmith/protobufjs/handlebars/fast-uri/uuid). `git diff f172ef63b origin/p0/security -- museum-backend/package.json` = VIDE (package.json non touché par la branche). Le lockfile résout déjà `ws@8.18.1` + `brace-expansion@5.0.5` transitivement (`pnpm-lock.yaml:5410,2448`) mais sans pin défensif. La roadmap de la branche marque elle-même I-SEC12 **❌** (ligne 211). Le commit message "12 items" ne liste PAS I-SEC12 (bullet C4 = "A5/I-SEC1/I-SEC10/B17").
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ❌ reste P0 ouvert. Risque réel modeste (versions sûres déjà résolues, 0 HIGH/CRITICAL) mais le pin défensif 1-ligne annoncé n'a PAS été appliqué. Le "close sweep" ne couvre pas cet item.
  - Confiance: haute

- **B17** — Verdict: PARTIAL (code DONE-BRANCH ; rotation = NEEDS-OPS-HUMAN)
  - Preuve: `git diff f172ef63b origin/p0/security -- museum-backend/.env.example` montre `-ANTHROPIC_API_KEY=` (présent ligne 128 à la merge-base, retiré sur la branche). 0 hit `ANTHROPIC_API_KEY` dans `.env.example` / `.env.production.example` sur la branche ; les seules occurrences `ANTHROPIC` résiduelles sont légitimes (peer dep `@langchain/anthropic`, commentaires team-skill, docs). `.env` réel non git-tracké. Le placeholder retiré était VIDE (`ANTHROPIC_API_KEY=` sans valeur). La roadmap de la branche (ligne 99) flagge que le `.env` PROD (P0.C6, séparé) "peut contenir une vraie key à auditer/revoke Tim-side".
  - Ref vérifiée: origin/p0/security
  - Action roadmap: ✅ partie code (`.env.example` nettoyé, déjà ✅ ligne 99) / ⚠️ rotation de l'éventuelle vraie key dans `.env` prod = NEEDS-OPS-HUMAN (Tim). NB : la suppression complète des vars mortes dans `.env`/`.env.production.example` est trackée séparément sous P0.C6 (❌ ouvert, ligne 113, hors LOT 1) — DOMAINE 2.
  - Confiance: haute
