# B4 — Lot P0 sécurité/PII #293 (`e0aade002`) + CodeQL fixes (`f172ef63b`)
## Angle ARCHITECTURE & CORRECTNESS / wiring / intégration

Reviewer: fresh-context senior read-only (UFR-022). Branche `dev` @ HEAD `89852f2a1`.
Méthode: lecture de l'ÉTAT FINAL des fichiers + trace du call-graph. Citations `path:line` vérifiées.

---

## NOTE : 8.5 / 10 — VERDICT : APPROVED

Intégration propre, pas posée-à-côté. Le wiring est au bon chokepoint sur tous les items
audités. Deux gaps de correctness réels (un sur le cost-breaker recovery, un TOCTOU TOTP)
mais tous deux **low-severity** et hors du chemin d'attaque V1 réaliste. Aucun blocker.

---

## ✅ Bien fait

### A3/A9 — Sentry tags scrub au bon chokepoint
- `beforeSend` (`sentry.ts:69`) câble `scrubEvent`, qui scrub `event.tags` AVANT envoi
  (`packages/musaium-shared/src/observability/sentry-scrubber.ts:220-232`). C'est le BON
  chokepoint : `beforeSend` est le dernier hook avant transport, donc il attrape AUSSI les
  `Sentry.setTag()` faits hors du wrapper `captureExceptionWithContext`.
- Defense-in-depth correcte : `captureExceptionWithContext` (`sentry.ts:109-110`) scrub la
  source à l'écriture du tag, ET `scrubEvent` re-scrub à la sortie. Deux couches
  indépendantes, pas de redondance inutile (la source attrape le format précis, le sink
  attrape les call-sites oubliés).
- `tags` walk applique les 2 regex (header + URL-like value) — `SENSITIVE_HEADER_REGEX` puis
  `scrubUrl` sur valeurs URL-like (`sentry-scrubber.ts:223-229`). `scrubRecord` traverse
  d'abord les body-fields. Couverture complète.
- `SENSITIVE_QUERY_KEYS` étendu 7→11 (`code`/`state`/`email`/`phone`) — ferme bien le leak
  magic-link/OAuth query-string (`sentry-scrubber.ts:29-41`). `scrubUrl` lowercase la clé
  avant `.has()` (`:151`) → case-insensitive, robuste.

### A4 — Langfuse `mask: stripFreeText`
- Câblé au ctor (`langfuse.client.ts:68`), donc appliqué centralement par
  `maskEventBodyInPlace` sur CHAQUE event/observation body avant transport. Bon chokepoint.
- Fail-safe rigoureux : try/catch global retourne l'input inchangé + warn-once sans logger
  `data` (`strip-free-text.ts:138-146`). Lit les branches free-text AVANT le clone pour que
  les Proxy hostiles déclenchent le catch immédiatement (`:95-101`) — defensive design réel,
  pas cosmétique.
- Préserve `usage`/`model`/`usageDetails` byte-identical → la cost-UI Langfuse continue de
  fonctionner. Le mask scrub le free-text, PAS les tokens. Distinction marker `[STRIPPED]`
  vs Sentry `[redacted]` pour désambiguïsation des logs.
- Zero-overhead quand désactivé : ctor jamais instancié si `langfuse.enabled === false`
  (`langfuse.client.ts:38-39`).

### A6/A7 — cost-breaker `canAttempt()` câblé fail-CLOSED sur TOUS les paths
- **Default path** : `checkCostBreakerOrThrow('invokeSection')` à
  `langchain.orchestrator.ts:333`, AVANT `runSectionTasks` (`:353`). Commentaire explique
  correctement pourquoi AVANT le section-runner (le runner avale les erreurs per-task en
  fallback ; la rejection breaker doit bypasser ça). Throw bubble jusqu'à
  `mapOrchestratorError` → 503 `CIRCUIT_BREAKER_OPEN`.
- **Walk path** : `checkLatencyBreakerOrThrow` + `checkCostBreakerOrThrow('generateWalk')`
  à `langchain.orchestrator.ts:556-560`, AVANT `invokeWalkStructured`. Ferme bien A7 — le
  walk path early-returnait AVANT les deux guards auparavant. Les deux breakers (latency +
  cost) sont maintenant mirrorés.
- `wasHalfOpen` capturé AVANT `canAttempt()` (`llm-cost-circuit-breaker.ts` via getState à
  l'orchestrateur `:167`) car `canAttempt()` mute le probe-slot — ordre correct, commenté.
- R9 probe-failure : `maybeRecordHalfOpenProbeFailure` (default, `:187-200`) +
  `invokeWalkStructured` try/catch (walk, `:498-507`) appellent `recordFailure()` quand le
  probe HALF_OPEN est consommé mais aucune section ne réussit → re-trip OPEN. Cohérent.

### I-SEC2 — VISION_BYTES_EQUIVALENT pricing
- `estimatePayloadBytes` substitue le forfait `VISION_BYTES_EQUIVALENT` (4000 = 1000 tokens
  × 4 bytes) par item `image_url`, indépendant de la source (base64 vs https)
  (`llm-prompt-builder.ts:478-480`, `llm-cost-pricing.ts:61-62`). Ferme l'inflation ×100-1000
  sur data-URL qui trippait le breaker sur la 1ère image légitime. `FALLBACK_PRICING` >
  tout modèle priced → over-protect (`llm-cost-pricing.ts:33-36`). Solide.

### I-SEC3 — ART_KEYWORDS role gate
- Ordering EXACT recommandé par CLAUDE.md "Mutating middleware ordering" :
  `isAuthenticated → requireRole(ADMIN,MODERATOR) → taxonomyWriteLimiter`
  (`chat-message.route.ts:203-209`). Limiter APRÈS le role gate → un visiteur 403 ne
  consomme pas le bucket admin. `requireRole` accepte super_admin implicitement. Correct.

### I-SEC5 — EXPORT_PSEUDONYM_SALT prod-validation
- `validateExportPseudonymSalt` (`env.production-validation.ts:169-181`) : required + ≥32
  chars + **drift detection** (`env.exportPseudonymSalt !== salt` → throw). Le drift-check
  est la bonne défense : un refactor futur qui drop le wiring env.ts fail-fast au boot au
  lieu de bypasser silencieusement. Pattern miroir cohérent avec CSRF/MFA.

### I-SEC7 — access-token denylist (ADR-064)
- Consommée au BON endroit : `isAuthenticated` (`authenticated.middleware.ts:81-83`) ET
  `isAuthenticatedJwtOnly` (`:111-113`), APRÈS `verifyAccessTokenWithClaims`, AVANT de
  peupler `req.user`. Chokepoint auth correct.
- TTL cohérent : `logout` calcule `ttlSec = accessExpSec - now` (`authSession.service.ts:241`),
  no-op si ≤0 (`redis-access-token-denylist.ts:68`). L'entrée Redis expire EXACTEMENT quand
  le JWT expirerait naturellement → pas de fuite mémoire, pas de faux-négatif.
- `SET ... EX ... NX` atomique (`:70`) — pas de race EXPIRE séparé, NX ne reset pas un TTL
  existant. Fail-OPEN sur erreur Redis (`has()` retourne false, `:84`) — defense-in-depth,
  une panne Redis ne devient pas une panne auth globale. Bien justifié (ADR-064 R9).
- Wiring composition-root complet : `index.ts:139-141` câble les DEUX surfaces (middleware
  module-level setter + AuthSessionService DI setter post-construction). Late-wiring assumé
  et documenté (auth singletons instanciés avant le boot path).
- Logs PII-safe : `jtiHashFirst8` SHA-256, jamais le jti complet (`:21-26, 96-97`).

### I-SEC7a — TOTP replay (RFC 6238 §5.2)
- `verifyTotpCode` retourne `{ step }` (pas un boolean) → le caller peut ledger
  (`totpService.ts:51-72`, discrimination `delta === null` correcte, pas `delta > 0`).
- Les 3 paths rejettent `result.step <= lastStep` : `verifyMfa` (`:55-62`), `challengeMfa`
  (`:68-75`), même `code: INVALID_MFA_CODE` que "wrong code" → un attaquant ne distingue pas
  wrong-code de replay-detected. `recoveryMfa` stamp le step courant sans tighten la window
  (`:72-74`) — raisonnement correct (recovery one-use = flag `consumedAt`, pas le step ledger).
- Migration nullable-then-stamp zero-downtime (`AddTotpLastUsedStep...ts:27-31`), scope
  restreint au lieu d'embarquer la dérive du dev DB (honnête, tracké TD-MIG-*).

### I-SEC10 — KE scraper Content-Length 2-layer cap
- `readBodyWithCap` (`html-scraper.ts:182-243`) : Layer 1 pre-guard Content-Length (reject
  avant de consommer le body), Layer 2 streamed cumulative-bytes avec `reader.cancel()`
  past cap. Defense-in-depth réelle — un serveur qui ment sur Content-Length ne bypasse pas
  Layer 2. RAM reste O(maxContentBytes). `TextDecoder fatal:false` → pas de throw sur
  truncation mid-codepoint. Bien fait.

### CodeQL fixes (`f172ef63b`)
- `#78 sentry.ts:59-62` — regex ancrées `^...($|/)` ferment le vrai bypass
  `api.musaium.com.attacker.com`. C'est le fix correct (le finding ERROR légitime).
- `#36 logoutLimiter`, `#38 userLimiter` sur image-serve — vrais rate-limit gaps comblés,
  bon ordering.
- `#77 cookie-parser Object.create(null)` — fix structurel propre contre proto-pollution.
- `#75 randomInt`, `#30 String(bigint)` — cosmétiques honnêtement documentés comme tels (no
  runtime change), pas de sur-claim.
- Triage honnête : 6 fixés / 16 dismissed avec rationale par-alerte (pas de wipe en bloc).

---

## ⚠️ À améliorer

### W1 — [MEDIUM-correctness] HALF_OPEN recovery wipe le `dailySpend` mid-day
`three-state-circuit.ts:128-135` : sur `recordOutcome('success')` depuis HALF_OPEN appelle
`strategy.reset()`, qui dans `cost-trip-strategy.ts:63-66` wipe `hourlyWindow` **ET**
`dailySpend` (`{ day:'', cents:0 }`).

Scénario reproductible : breaker trippe OPEN sur **hourly spike** (pas daily cap) → 5 min
cooldown → HALF_OPEN → probe légitime réussit. Dans `recordCharge`
(`llm-cost-circuit-breaker.ts:136-150`) : si >1h s'est écoulé depuis le spike (hourly window
pruné, `cost-trip-strategy.ts:58-61`) ET daily sous cap → `shouldTrip()` false →
`recordOutcome('success')` → `strategy.reset()` → **le compteur daily intra-journée est remis
à zéro**.

Conséquence : après une récupération de spike horaire, le daily-cap ($500/j) repart de zéro
en milieu de journée → le hard-cap journalier peut être dépassé d'un facteur ~2 sur une
journée à spikes multiples. C'est un affaiblissement partiel de la garantie I-SEC2/A6.

Sévérité MEDIUM (pas HIGH) car : (a) V1 single-instance, volume bas (cf. no-staging
prelaunch) ; (b) il faut un trip horaire SUIVI d'une fenêtre de récupération >1h, séquence
peu fréquente ; (c) le daily-cap reste un garde-fou large ($500), pas la 1ère ligne de
défense (guardrail-budget LLM-judge $5/j câblé séparément).

Fix propre : `CostTripStrategy.reset()` ne devrait wiper QUE `hourlyWindow` (la dette qui a
causé le trip), pas `dailySpend` (compteur de budget global indépendant du FSM). Ou découpler
le reset FSM-driven (`recordOutcome success`) d'un reset de window-only. Le trip-BEFORE-recovery
ordering (`llm-cost-circuit-breaker.ts:142-149`) protège déjà le cas daily-cap-trip, mais pas
le cas spike-trip-puis-wipe-daily.

### W2 — [LOW-correctness] TOCTOU sur le step TOTP / non-atomic markUsed
`markUsed` (`totp-secret.repository.pg.ts:60-62`) est un UPDATE inconditionnel
(`repo.update({userId}, {lastUsedStep})`), SANS guard `WHERE last_used_step < :step`. Le
check replay est read-then-check-then-write dans le use case
(`challengeMfa.useCase.ts:68-77`, `verifyMfa.useCase.ts:55-66`), non transactionnel.

Fenêtre TOCTOU : deux requêtes concurrentes portant le MÊME code (même step) lisent
`lastUsedStep` AVANT que l'une écrive → les deux passent le check `step <= lastStep` → les
deux émettent une session. Le replay-within-window n'est donc pas 100% fermé sous
concurrence.

Sévérité LOW : (a) le route limiter MFA (5 tries / 15 min par user, `mfa.route.ts`) borne
fortement la fenêtre de course ; (b) il faut deux requêtes parallèles sub-seconde avec le
même code capturé ; (c) le vecteur principal (replay séquentiel) EST fermé. Fix idéal :
markUsed conditionnel `WHERE user_id = :u AND (last_used_step IS NULL OR last_used_step < :step)`
+ vérifier `affected === 1` côté use case avant d'émettre la session (compare-and-set).

### W3 — [INFO] `markEnrolled` + `markUsed` non-atomiques dans verifyMfa
`verifyMfa.useCase.ts:65-66` enchaîne deux awaits séparés (`markEnrolled` puis `markUsed`).
Pas transactionnel. Impact quasi-nul (enrollment-verify, idempotent via guard `enrolled_at IS
NULL`), mais un crash entre les deux laisserait `enrolledAt` stampé sans `lastUsedStep` → le
prochain code passerait sans contrainte de step (équivalent à NULL = "never used"). Bénin.

---

## 🔧 Reste à faire

1. **W1** — découpler `dailySpend` du `strategy.reset()` FSM-driven (ou reset window-only sur
   recovery). C'est le seul gap qui touche une garantie de sécurité (cap journalier). À
   traiter avant scale (Phase 3 Redis promotion mentionnée dans le header du fichier serait
   l'occasion). Ajouter un test `HALF_OPEN recovery preserves dailySpend` (absent aujourd'hui
   — la suite `cost-trip-strategy.test.ts` teste reset() mais pas ce chemin de recovery).
2. **W2** — markUsed conditionnel compare-and-set + check `affected` si la doctrine veut
   fermer la fenêtre TOCTOU sous concurrence (sinon documenter explicitement le trade-off
   "limiter borne la course" dans le spec C3, actuellement implicite).
3. Aucun blocker V1. ADR-063/064/065 alignés au code (mask central, denylist fail-OPEN,
   redis volatile-ttl). Pas de sur-ingénierie détectée — les abstractions (ThreeStateCircuit
   FSM extrait, port denylist, no-op default) sont justifiées par ≥2 consommateurs réels.
