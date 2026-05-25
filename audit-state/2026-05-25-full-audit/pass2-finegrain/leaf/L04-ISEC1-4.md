# L04 — I-SEC1..I-SEC4 (P0.I.A) — Audit fresh-context READ-ONLY

- **Branche/HEAD** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`
- **Date** : 2026-05-25
- **Méthode** : re-dérivation from-scratch, AUCUNE confiance aux marqueurs antérieurs. Chaque verdict confirmé par lecture du code (path:line) + provenance git.
- **Principe** : "code says X" (vérifié) vs "I expect X" (supposé). Tout ci-dessous = vérifié par `Read`/`Grep`/`git`.

---

## I-SEC1 — Redis prod `maxmemory` + eviction policy

**VERDICT : ✅ FIXÉ (vérifié).** Le marqueur DONE-DEV est exact.

- **Path:line réel** : `museum-backend/deploy/docker-compose.prod.yml:372-375`
  - `:372-373` `--maxmemory` `${REDIS_MAXMEMORY:-512mb}`
  - `:374-375` `--maxmemory-policy` `${REDIS_MAXMEMORY_POLICY:-volatile-ttl}`
  - Commentaire `:367-371` justifie `volatile-ttl` : évince les clés TTL-court d'abord (cache 1h) AVANT les compteurs `llm_cost` (TTL 25h) → préserve la garantie quota financial-DoS sous pression mémoire. Raisonnement cohérent.
- **Env documenté** : `museum-backend/.env.example:163` `REDIS_MAXMEMORY=512mb`, `:169` `REDIS_MAXMEMORY_POLICY=volatile-ttl`. Defaults compose alignés avec env.example. Cohérent.
- **Provenance git** : fichier dernier touché par `e0aade002` (#293, "Lot P0 sécurité/PII", 12 items). `e0aade002` = ANCESTOR de `dev` HEAD (vérifié `git merge-base --is-ancestor`).
- **Divergence vs marqueur** : marqueur roadmap cite `docker-compose.prod.yml:372` — exact. Note roadmap signale que le claim antérieur citait un chemin repo-root `deploy/…` au lieu du réel `museum-backend/deploy/…` ; confirmé : le seul `docker-compose.prod.yml` du repo est sous `museum-backend/deploy/`.
- **Debt résiduelle (HORS scope I-SEC1, NON bloquant)** : `:359` `TODO(infra): pin by digest redis@sha256:...` — image `redis:7-alpine` non pinnée par digest (tag mutable). Mineur, pas un défaut du fix maxmemory lui-même.

---

## I-SEC2 — Vision pricing forfait per-image (au lieu de byte-length brut)

**VERDICT : ✅ FIXÉ ET WIRED (vérifié).** Le marqueur DONE-DEV est exact. La constante existe ET est réellement utilisée dans le chemin de coût.

- **Constante** : `museum-backend/src/modules/chat/adapters/secondary/llm/llm-cost-pricing.ts:61-62`
  - `VISION_TOKEN_EQUIVALENT = 1000`
  - `VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN = 4000` (`:62`)
- **Wiring (preuve que ce n'est pas du code mort)** :
  - `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:3` importe `VISION_BYTES_EQUIVALENT`.
  - `:467-468` `isImageUrlItem` détecte `{type:'image_url'}`.
  - `:477-481` chaque item image → `total += VISION_BYTES_EQUIVALENT` (forfait fixe), `continue` AVANT le `Buffer.byteLength` brut → la longueur base64 réelle (~1 MB) n'est JAMAIS comptée. Source-agnostic (URL https OU data-URL inline), conforme D2.
  - `:490-497` `estimatePayloadBytes` agrège.
  - Consommé par `langchain.orchestrator.ts:417` (`payloadBytes = estimatePayloadBytes(sectionMessages)`) et `:571` (walk). Donc le forfait alimente bien `estimateCostCents` → circuit breaker.
- **Provenance git** : `llm-cost-pricing.ts` dernier touché par `e0aade002` (#293), ancêtre de HEAD.
- **Divergence vs marqueur** : marqueur cite `llm-cost-pricing.ts:59` ; la définition réelle est à **:62** (`:43-59` = JSDoc qui *mentionne* `VISION_BYTES_EQUIVALENT`, la déclaration code est :61-62). **Léger drift de ligne (cosmétique)**, pas une fausse claim. Le marqueur cite aussi `llm-prompt-builder.ts` comme site d'usage — confirmé.
- **Debt résiduelle** : aucune. Note honnête déjà dans le code (`:48-49`) : tarif OpenAI vision "NOT WebFetch-verified at this commit" + tune Q1 V2 si drift > 10 % vs facture. Conforme UFR-013.

---

## I-SEC3 — POST /art-keywords gaté requireRole(ADMIN,MODERATOR) + rate-limit

**VERDICT : ✅ FIXÉ (vérifié).** Le marqueur DONE-DEV est exact.

- **Path:line réel** : `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:203-209`
  - `:204` path `'/art-keywords'`
  - `:205` `isAuthenticated`
  - `:206` `requireRole(UserRole.ADMIN, UserRole.MODERATOR)` ← le gate de rôle
  - `:207` `taxonomyWriteLimiter`
  - `:208` handler `createBulkUpsertArtKeywordsHandler`
- **Rate-limiter** : `:176-181` `taxonomyWriteLimiter` = `limit:10`, `windowMs:60_000` (10/min), `keyGenerator: byUserId`, `bucketName:'taxonomy-write'`. Conforme à la description marqueur (10/min byUserId).
- **Ordering** : `isAuthenticated → requireRole → taxonomyWriteLimiter`. Conforme au gotcha CLAUDE.md "Mutating middleware ordering" (le limiter MUTE le bucket Redis → DOIT s'exécuter APRÈS le role-gate short-circuit, sinon un visiteur 403 consommerait le bucket de l'admin). Commentaire `:198-202` explicite ce raisonnement. Correct.
- **Pas de route POST /art-keywords non-gardée ailleurs** : vérifié — l'autre `router.post(` à `:183` cible `/sessions/:id/messages` (route distincte). `:197` est un `GET /art-keywords` (lecture, isAuthenticated seul — acceptable). Une seule route d'écriture, gardée.
- **`requireRole` sémantique vérifiée** : `museum-backend/src/shared/middleware/require-role.middleware.ts:11-31` — pas de `user?.role` → 403 ; `SUPER_ADMIN` implicite OR rôle ∈ allowed → next ; sinon 403. Robuste.
- **Provenance git** : `chat-message.route.ts` dernier touché par `e0aade002` (#293), ancêtre de HEAD.
- **Divergence vs marqueur** : marqueur cite `chat-message.route.ts:204` "route POST avec requireRole" — la ligne :204 est le **string du path**, le `requireRole` réel est à **:206**. Drift mineur (route bloc :203-209). Pas une fausse claim.
- **Debt résiduelle** : aucune dans le scope.

---

## I-SEC4 — POST /auth/api-keys : un user free authentifié peut-il forger une clé `msk_` ?

**VERDICT : ✅ FIXÉ — le bug N'EST PAS LIVE.** Un user free/visitor authentifié NE PEUT PAS forger de clé `msk_`. Le texte roadmap décrivant le bug comme "live" est **STALE / RÉFUTÉ par le code**.

- **Path:line réel** : `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-api-keys.route.ts:22-49`
  - `:24` `isAuthenticatedJwtOnly`
  - `:29` `requireRole(UserRole.MUSEUM_MANAGER, UserRole.ADMIN)` ← **le gate qui réfute "live"**
  - `:30` `apiKeyLimiter` (existe : `auth-rate-limiters.ts:108`)
  - `:31` `validateBody`
  - Ordering : role-gate `:29` AVANT le limiter `:30` (commentaire `:25-28` cite express mutating-order / lib-docs).
- **Rejet du free user** : l'enum `UserRole` (`user-role.ts:16-20`) n'a PAS de tier `FREE`. Le rôle par défaut d'un user B2C authentifié = `VISITOR` (`:16`), qui n'est ni `MUSEUM_MANAGER` ni `ADMIN` ni `SUPER_ADMIN` → `requireRole` retourne **403** (require-role.middleware.ts:22, le `includes` échoue). Donc un visitor authentifié ne franchit pas `:29`. **Bug non exploitable.**
- **Provenance git (DIVERGENCE NOTABLE)** : le gate `requireRole(MUSEUM_MANAGER, ADMIN)` à `:29` a été introduit par **`71f103b35` (#294, "feat(p0-gdpr): close 8 V1 GDPR/consent gaps")**, PAS par #293 (le lot sécurité). Vérifié `git log -S "requireRole(UserRole.MUSEUM_MANAGER, UserRole.ADMIN)"`. `71f103b35` = ANCESTOR de `dev` HEAD (vérifié). Donc le fix est bien sur `dev`, mais provient du lot GDPR, pas du lot sécurité — le bloc de correction roadmap (`:66`) attribue globalement les fixes à #293/#294/#295 sans préciser que I-SEC4 spécifiquement vient de #294.
- **Divergence vs marqueur** :
  - **La ROW roadmap `:229` est INCOHÉRENTE en interne** : elle porte le marqueur `✅` mais sa **prose dit encore "tout user authentifié (free visitor inclus) forge une clé API B2B msk_ — no role/tier check"** (description du bug LIVE, non corrigée). Le `path:line` cité `:20-42` est imprécis (le gate est `:29`).
  - La cohérence n'est rétablie que par le **bloc de correction `:70`** : *"I-SEC4 `auth-api-keys.route.ts:29` a déjà `requireRole(MUSEUM_MANAGER,ADMIN)` (claim STALE)"* — CECI est exact (vérifié :29).
  - Et `:87` note "I-SEC4/I-SEC6 textes 'live' à réécrire (bugs fixés/jamais réels)" — confirmé, la réécriture de la prose de la row :229 reste à faire.
- **Conclusion I-SEC4** : **FIXÉ, non-live.** Le marqueur `✅` est correct ; la **prose de la row reste mensongère/stale** (décrit un bug live qui ne l'est pas) → dette documentaire UFR-013 à corriger.
- **Debt résiduelle** :
  1. **Réécrire la prose row `:229`** pour refléter l'état fixé (path `:29`, gate présent), comme l'admet déjà le bloc `:87`. La row actuelle, lue isolément, induit en erreur (✅ + texte "bug live").
  2. Attribution PR : préciser que I-SEC4 vient de #294 (`71f103b35`), pas #293.

---

## Synthèse provenance git (vérifiée)

| Item | Fichier | Dernier commit | PR | Ancêtre de dev HEAD ? |
|---|---|---|---|---|
| I-SEC1 | docker-compose.prod.yml | `e0aade002` | #293 | ✅ oui |
| I-SEC2 | llm-cost-pricing.ts | `e0aade002` | #293 | ✅ oui |
| I-SEC3 | chat-message.route.ts | `e0aade002` | #293 | ✅ oui |
| I-SEC4 | auth-api-keys.route.ts | `71f103b35` (gate :29) | **#294** | ✅ oui |

## Verdict global

Les 4 items sont **réellement FIXÉS sur `dev`** (vérifié code + ancestry git). Aucun n'est "live".

Divergences relevées (toutes mineures / documentaires, aucune fausse claim de complétude) :
1. **I-SEC4 prose row `:229` stale** (décrit le bug comme live malgré le ✅) — dette doc à corriger ; déjà reconnue par bloc `:70`/`:87`.
2. **Drifts de ligne cosmétiques** : I-SEC2 def réelle :62 (marqueur :59), I-SEC3 requireRole réel :206 (marqueur :204), I-SEC4 gate réel :29 (row cite :20-42).
3. **Attribution PR** : I-SEC4 fix vient de #294 (GDPR), pas #293 (sécurité) comme le suggère le regroupement du bloc de correction.

Aucune divergence ne contredit le verdict FIXÉ. La roadmap "ne mentait pas sur la complétude" (conforme à son propre auto-diagnostic `:66`) — elle traîne des descriptions stale et des drifts de ligne.
