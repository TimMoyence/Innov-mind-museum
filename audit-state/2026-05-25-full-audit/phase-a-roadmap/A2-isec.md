# A2 — Audit P0.I.A Security / fuites de données (I-SEC1..12)

> READ-ONLY fresh-context audit (UFR-022). Branche `dev` @ HEAD `89852f2a1`. Vérité = code courant, pas le marqueur roadmap.
> Méthode : Read/Grep sur l'arbre `dev` courant + `git show <merge-base>` pour distinguer "fixé depuis l'audit" vs "claim toujours stale".
> NOTE TRANSVERSALE : le finding `D1-lot1-security.md` a été écrit contre la branche `origin/p0/security` (2 commits, merge-base `f172ef63b`). Cette branche est SUPERSEDED : LOT 1 a été mergé via `e0aade002` (#293) et LOT 3 via `811fd501c` (#295). Plusieurs verdicts D1 (notamment I-SEC12) sont donc périmés vs le code `dev` réel. Cet audit re-tranche au HEAD.

---

### I-SEC1 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/deploy/docker-compose.prod.yml:372` `--maxmemory ${REDIS_MAXMEMORY:-512mb}` + `:374` `--maxmemory-policy ${REDIS_MAXMEMORY_POLICY:-volatile-ttl}`, commentaire bloc `:367` "C4 I-SEC1 (2026-05-21)". `volatile-ttl` évince le cache (TTL 1h) avant les compteurs llm_cost (TTL 25h) → garantie quota financier préservée sous pression mémoire. Path réel confirmé `museum-backend/deploy/...` (la roadmap cite `docker-compose.prod.yml:372` sans le préfixe `museum-backend/` — re-localisé, même fichier).
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC2 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : forfait per-image substitué au byte-length brut. `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:480` `total += VISION_BYTES_EQUIVALENT` pour tout item `{type:'image_url'}` (helper `payloadBytesForContent` ligne 470). Constante définie `museum-backend/src/modules/chat/adapters/secondary/llm/llm-cost-pricing.ts:62` `VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN` (= 4000). Plus de `Math.ceil(base64Bytes/4)`.
- CHECKBOX-FLIP : non
- Amélioration/debt : NOTE-PATH — la roadmap cite `llm-cost-pricing.ts:43-59` / `:59` ; la constante exportée réelle est `:62` (le path module est `adapters/secondary/llm/`, pas `useCase/llm/`). Mineur, à re-localiser au prochain rewrite.

### I-SEC3 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:204` route `POST /art-keywords` chaîne `isAuthenticated → requireRole(UserRole.ADMIN, UserRole.MODERATOR)` (`:206`) `→ taxonomyWriteLimiter` (`:207`, 10/min byUserId défini `:176`). Limiter monté APRÈS le role gate (commentaire `:171-172` cite CLAUDE.md "Mutating middleware ordering"). `import { requireRole }` `:22`.
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC4 — VERDICT: DONE (texte roadmap STALE)
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-api-keys.route.ts:29` `POST /api-keys` gaté `requireRole(UserRole.MUSEUM_MANAGER, UserRole.ADMIN)` AVANT `apiKeyLimiter` (`:30`) AVANT `validateBody` (`:31`). Le free visitor reçoit 403 et ne forge plus de clé `msk_`. Commentaire I-SEC4 `:25-28` (design D3). Audit-block roadmap (ligne 70) le confirme "claim STALE".
- CHECKBOX-FLIP : non (déjà ✅). RECOMMANDATION TEXTE : la cellule roadmap `:214` décrit encore le bug comme LIVE ("tout user authentifié forge une clé") — texte mensonger-par-omission (UFR-013), à réécrire en "DONE — gaté requireRole(MUSEUM_MANAGER,ADMIN)". Pas un flip de checkbox, un flip de prose.
- Amélioration/debt : RAS code.

### I-SEC5 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/config/env.production-validation.ts:170` `required('EXPORT_PSEUDONYM_SALT', ...)` + `:171` `assertSecretLength('EXPORT_PSEUDONYM_SALT', salt)` (≥32 chars, fail-fast au boot). Commentaire I-SEC5 `:159`. `:178` garde-fou anti-drift `env.exportPseudonymSalt`. Le fallback littéral `'musaium-admin-export-v1'` = 0 occurrence dans `museum-backend/src` (grep vide). GDPR : pseudonymisation export non-réversible avec salt public.
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC6 — VERDICT: DONE (texte roadmap FALSE-CLAIM — bug jamais réel)
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/modules/auth/useCase/session/login-rate-limiter.ts:104` `slidingRedisKey = `${KEY_PREFIX}${hashEmailForKey(email)}`` → la clé sliding-window est SHA-1-hashée (`hashEmailForKey` `:100-102`), EXACTEMENT comme la clé lockout (`:106`). Le claim roadmap (`:216`) "sliding-window key = email plaintext `login-attempts:<raw-email>`" est FAUX. Vérification git : `git show f172ef63b:.../login-rate-limiter.ts` montre `slidingRedisKey` déjà hashé au merge-base → ce n'était PAS un fix récent, le claim était stale/faux dès l'audit d'origine. Aucune PII email en keyspace/AOF.
- CHECKBOX-FLIP : non (déjà ✅). RECOMMANDATION TEXTE : la cellule `:216` affirme un bug PII LIVE qui n'existe pas dans le code — FALSE-CLAIM à supprimer/corriger (UFR-013). Réécrire "DONE — les deux clés (sliding + lockout) SHA-1-hashées via hashEmailForKey, login-rate-limiter.ts:100-106".
- Amélioration/debt : SHA-1 utilisé comme identifiant non-cryptographique (eslint-disable `sonarjs/hashing` justifié `:101`) — acceptable pour un key-id (pas de stockage/signature). RAS.

### I-SEC7 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : (a) TOTP replay — `museum-backend/src/modules/auth/adapters/secondary/pg/totp-secret.repository.pg.ts:60` `async markUsed(userId, at, step)` persiste `{ lastUsedAt, lastUsedStep: String(step) }` (commentaire RFC 6238 §5.2 `:54`). NB le path module réel est `adapters/secondary/pg/` (roadmap cite `totp-secret.repository.pg.ts:60` sans préfixe — même fichier). (b) Access-token denylist — `museum-backend/src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts:8` `KEY_PREFIX = 'denylist:access:'` (ADR-064). markUsed passe des valeurs concrètes (pas `undefined`) → pas affecté par le gotcha TypeORM `.update({field:undefined})`.
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC8 — VERDICT: OPEN  ⚠️ SEUL OPEN SÉCURITÉ CRITIQUE — CONFIRMÉ AU HEAD
- Marqueur roadmap actuel : ❌
- État réel vérifié : cross-tenant knowledge bleed TOUJOURS OUVERT au HEAD `89852f2a1`.
  1. `museum-backend/src/modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity.ts:14-68` — l'entité `artwork_knowledge` n'a AUCUNE colonne `museum_id`/`museumId`. Clé unique = `(title, artist, locale)` (`:11`) → base de connaissances PARTAGÉE cross-tenant. Le seul champ géo est `roomId` (`:60`, W3 prep SigLIP) — pas de scoping musée.
  2. `museum-backend/src/modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port.ts:12` `findById(id: string): Promise<ArtworkKnowledge | null>` — signature sans scope.
  3. `museum-backend/src/modules/knowledge-extraction/adapters/secondary/pg/typeorm-artwork-knowledge.repo.ts:19-21` `findById` = `this.repo.findOne({ where: { id } })` — ZÉRO filtre musée.
  4. `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:357` `resolveCurrentArtwork()` (`:350-364`) appelle `repo.findById(currentArtworkId)` où `currentArtworkId = session.currentArtworkId` (`:354`, UUID client-controlled) → `row.title` injecté dans la section `[CURRENT ARTWORK]` du system prompt (`:359`). Un UUID d'œuvre d'un autre musée fait fuiter son titre/connaissance dans le prompt.
  La cellule roadmap (`:218`) note correctement : #294 « reclassify I-SEC8 » mais NE CORRIGE PAS le scoping (commit `71f103b35` confirmé sur l'historique du fichier — c'est le dernier touch, et il n'ajoute pas de colonne museum_id).
- CHECKBOX-FLIP : non — reste ❌. Confirmé OPEN, pas de fix au HEAD.
- Amélioration/debt : **V1-blocker sécurité.** Options : (a) ajouter `museum_id` à `artwork_knowledge` + scoper `findById(id, museumId)` au `session.museumId` (migration + index) ; OU (b) à court terme, vérifier que la `row` résolue appartient au musée de la session avant de l'injecter (rejet/null si mismatch) — bloque le bleed sans migration. Thème récurrent : même classe que reviews/tickets cross-tenant (cf P0.C7). Doctrine `feedback_track_not_treat_v1_blocker.md` → à FIXER en session, pas à documenter.

### I-SEC9 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/modules/knowledge-extraction/domain/ports/extraction-queue.port.ts:8-11` `ExtractionJobPayload = { url: string; locale: string }` — `searchTerm` (raw user chat text) RETIRÉ ; commentaire `:3` documente le retrait pour data-minimisation Art.5(1)(c). 0 `searchTerm` dans le type payload. (Les `searchTerm` restants sont des params de méthode `searchByName`/`searchByTitle`, sans rapport — non persistés en queue.)
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC10 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts` — garde Content-Length deux-couches : Layer 1 pre-fetch `:188` `response.headers.get('content-length')` reject si `declared > maxContentBytes` (`:191-195`) ; Layer 2 streamed cumulative-bytes cap avec `reader.cancel()` au-delà du cap (commentaire `:171-176`). Remplace `response.text()` non-gardé. RAM O(maxContentBytes).
- CHECKBOX-FLIP : non
- Amélioration/debt : RAS.

### I-SEC11 — VERDICT: DEFERRED (V1.1, latent — pas live V1)
- Marqueur roadmap actuel : ↓
- État réel vérifié : `museum-backend/src/modules/chat/useCase/orchestration/message-commit.ts:28` `urlHeadProbe?: UrlHeadProbe` optionnel ; `:26` commentaire "V1.1 rollout after baking. NFR8: undefined → skip silently" ; `:49` garde `if (metadata.sources && ... && urlHeadProbe)` → no-op tant que la dep n'est pas câblée. Au V1 `urlHeadProbe` = `undefined` (pas de `new UrlHeadProbe` injecté). SSRF latent (pas de probe live), donc pas exploitable au V1, mais pré-condition V1.1 = valider host/IP avant d'activer.
- CHECKBOX-FLIP : non — ↓ correct (dégradé/déféré V1.1, cohérent avec l'audit-block ligne 72).
- Amélioration/debt : V1.1 — implémenter validation host/IP (deny private/link-local/metadata IPs) AVANT d'injecter `urlHeadProbe`. Ne pas activer la probe sans cette garde.

### I-SEC12 — VERDICT: DONE (finding D1 PÉRIMÉ — vérifiait la mauvaise branche)
- Marqueur roadmap actuel : ✅
- État réel vérifié : `museum-backend/package.json:80-81` `"brace-expansion": ">=5.0.6"` + `"ws": ">=8.20.1"` présents dans `pnpm.overrides` (`:74`). Les pins défensifs EXISTENT sur `dev`.
  IMPORTANT : `D1-lot1-security.md` (lignes 87-91) verdict "OPEN — overrides ne contient ni ws ni brace-expansion" est PÉRIMÉ : il vérifiait `origin/p0/security` (merge-base `f172ef63b`). `git log -S '"ws": ">=8.20.1"'` confirme que ces overrides ont été ajoutés par `811fd501c` (#295, LOT 3 feature-gates), mergé sur `dev` APRÈS la branche security. Le verdict OPEN du finding ne s'applique donc PAS au HEAD.
- CHECKBOX-FLIP : non — ✅ correct au HEAD.
- Amélioration/debt : NOTE-AUDIT — verdict D1 obsolète à corriger dans le suivi (ne reflète pas `dev`). 0 HIGH/CRITICAL ; CVE-2025-29927 (Next.js) non vulnérable per roadmap (n'affecte pas le backend de toute façon).
