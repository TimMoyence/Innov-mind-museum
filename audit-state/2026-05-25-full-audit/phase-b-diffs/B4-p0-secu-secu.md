# B4 — Audit sécurité réelle : Lot P0 sécurité/PII #293 + CodeQL #297

**Reviewer** : senior sécurité read-only, fresh-context (UFR-022).
**Scope** : `e0aade002` (105 fichiers, PR #293) + `f172ef63b` (7 fichiers, PR #297 CodeQL).
**Branche** : `dev` @ HEAD `89852f2a1`. État FINAL lu (pas le diff seul).
**Angle** : efficacité réelle du fix, bypass résiduels, tests adversariaux vs happy-path.

---

## Note : **7.5 / 10** — Verdict : **SOLIDE avec 1 trou PII réel + 1 TOCTOU réel**

Le lot est sérieux : la majorité des fixes tiennent à la lecture adversariale, les tests
sont en grande partie réellement adversariaux (replay sequentiel, authz 403/401, PII-seed,
SSRF matrix, fail-open). Mais le fix-phare (Langfuse PII egress, "Vecteur 2") a un trou qui
correspond à un chemin de prod réel, et la replay-protection TOTP n'est pas atomique sous
concurrence malgré le claim RFC 6238 §5.2. Ce ne sont pas des trous théoriques.

---

## ✅ Fix solides (tiennent à la lecture adversariale)

1. **scrubUrl / SENSITIVE_QUERY_KEYS** — couvre bien `code`, `state`, `email`, `phone`,
   `token` (+ `access_token`, `refresh_token`, `secret`, `api_key`, `apikey`, `password`),
   set de 11 entrées `sentry-scrubber.ts:29-41`. `event.tags` est **réellement** scrubbé
   dans `beforeSend` → `scrubEvent` walk les tags (`sentry-scrubber.ts:220-232`) : applique
   `scrubRecord` (clés body) + `SENSITIVE_HEADER_REGEX` (clés header) + `scrubUrl` sur les
   VALEURS url-like. Double défense au site wrapper `captureExceptionWithContext`
   (`sentry.ts:99-110`). Pas juste request/user/extra : tags inclus. ✅

2. **EXPORT_PSEUDONYM_SALT fail-fast** — non réversible. Fallback littéral SUPPRIMÉ
   (`admin-export.repository.pg.ts:19-25`). Boot prod fail-fast >= 32 chars +
   drift-detection (`env.production-validation.ts:169-181`) ; constructeur throw si unset
   (`admin-export.repository.pg.ts:53-59`). `pseudonymise` = SHA-256(`salt|value`) 64-bit
   (`pseudonym.ts:21-26`). Aucun fallback réversible. ✅

3. **art-keywords gate (I-SEC3/R10)** — `isAuthenticated → requireRole(ADMIN,MODERATOR) →
   taxonomyWriteLimiter` (`chat-message.route.ts:203-209`). Visiteur → 403, non-auth → 401
   (tests `chat-message.art-keywords.authz.test.ts:95,106`). Clé `msk_` : `validateApiKey`
   résout le rôle via `userRoleResolver`, défaut `'visitor'` (`apiKey.middleware.ts:87-91`)
   → une clé visiteur tombe en 403. Le gate est role-based, donc tient pour le threat
   model "visiteur ou clé basse-priv ne peut POST". Limiter APRÈS le role gate (pas
   d'inflation de compteur sur 403). ✅

4. **6 CodeQL findings (#297) réellement fermés** — vérifiés au diff + état final :
   - #36 `/logout` rate-limit : `logoutLimiter` 30/min byIp, monté AVANT validateBody
     (`auth-rate-limiters.ts:67-71`, `auth-session.route.ts:149`). ✅
   - #38 `/messages/:id/image` : `userLimiter` ajouté (`chat-media.route.ts:285`). ✅
   - #75 recovery codes : `randomBytes()%N` → `crypto.randomInt(0,N)` rejection sampling,
     bias-free (`recoveryCodes.ts`). ✅
   - #77 prototype pollution : `Object.create(null)` cookie store
     (`cookie-parser.middleware.ts`). ✅
   - #78 `tracePropagationTargets` ancrés `($|\/)` → `api.musaium.com.attacker.com` et
     `localhost:30001234` ne matchent plus (`sentry.ts:59-62`). Bypass header-injection
     `sentry-trace`/`baggage` fermé. ✅
   - #30 audit bigint : cosmétique, aucun changement runtime. ✅

5. **KE scraper SSRF/OOM** — Content-Length 2 couches RÉELLES : pré-fetch
   (`html-scraper.ts:188-199`) + streamed cumulative cap avec `reader.cancel()`
   (`:223-231`). Re-validation à CHAQUE hop de redirect (`fetchWithSafeRedirects:255-287`),
   IPv4-mapped-IPv6 hex+décimal décodé (`ipv6MappedToIpv4`), métadonnées cloud bloquées,
   `169.254/16`. OOM bornée O(maxContentBytes). Solide.

6. **Access-token denylist fail-OPEN** — assumé et documenté (ADR-064, `redis-access-token-
   denylist.ts:76-86`) : JWT exp = couche primaire, denylist = defense-in-depth. Warn
   rate-limité, jti hashé (pas de PII enumeration). Trade-off légitime.

---

## ⚠️ Fix faibles / contournables

1. **[MEDIUM-HIGH — PII egress réel] Langfuse `stripFreeText` ne couvre PAS le `content`
   en tableau (multimodal/vision).**
   `stripMessagesArray` (`strip-free-text.ts:51-62`) ne remplace `.content` QUE si
   `typeof content === 'string'`. Or le prompt builder émet, sur le chemin image/vision,
   un `HumanMessage` avec content **tableau** :
   `llm-prompt-builder.ts:257-261` →
   `content: [{ type:'text', text: finalText }, { type:'image_url', image_url:{ url } }]`
   où `finalText` embarque le message utilisateur brut (`<user_message>…</user_message>` +
   contexte localisation). Le Langfuse `CallbackHandler` est bien foldé sur l'invoke
   (`langchain.orchestrator.ts:71,245`) et sérialise ce content tableau vers
   `data.input.messages[*].content`. `stripFreeText` le laisse **intact** → PII (texte
   user + éventuel email/tél tapé) part vers `cloud.langfuse.com`. C'est exactement le
   "Vecteur 2" que le lot prétend fermer.
   **Le test PII-seed sentinel (R8, "global invariant qui ferme Vecteur 2") ne teste que
   `content` string** (`langfuse-pii-seed.test.ts:38-67`) + `strip-free-text.test.ts:33-60`.
   Aucun cas array-content. Le trou n'est donc pas détecté.
   **🔧 Fix** : dans `stripMessagesArray`, gérer `Array.isArray(content)` → strip chaque
   `{type:'text', text}` (et idem pour un `content` array sous `output`). Ajouter un cas
   de test multimodal au PII-seed.

2. **[MEDIUM — réplay TOTP non-atomique sous concurrence] `markUsed` est un UPDATE
   inconditionnel, pas un compare-and-swap.**
   `challengeMfa.useCase.ts:68-77` et `verifyMfa.useCase.ts:55-66` font "read-before-accept" :
   lecture `lastUsedStep` → check `result.step <= lastStep` → `markUsed(userId, now, step)`.
   `markUsed` = `repo.update({ userId }, { lastUsedAt, lastUsedStep })` sans WHERE
   conditionnel (`totp-secret.repository.pg.ts:60-62`). Deux requêtes concurrentes portant
   le MÊME code frais lisent toutes deux `lastStep` avant qu'aucune n'écrive → les deux
   passent le check → les deux sont acceptées (TOCTOU). RFC 6238 §5.2 "MUST NOT accept the
   second attempt" est respecté **séquentiellement** mais PAS sous concurrence, malgré le
   claim de conformité. Impact pratique borné (l'attaquant doit déjà détenir un code valide
   et racer dans la même fenêtre) mais le contrat §5.2 n'est pas tenu strictement.
   **Aucun test de concurrence/race** (les replay tests sont séquentiels uniquement —
   `challengeMfa.replay.test.ts`, `verifyMfa.replay.test.ts` ; grep `concurrent|race|
   Promise.all` = vide).
   **🔧 Fix** : `markUsed` en compare-and-swap : `UPDATE … SET last_used_step=:step WHERE
   user_id=:id AND (last_used_step IS NULL OR last_used_step < :step)`, et l'use case
   accepte uniquement si `affected === 1`. Ajouter un test `Promise.all` 2 codes identiques
   → 1 succès / 1 rejet.

3. **[LOW — bypass théorique] `scrubUrl` ne décode pas les clés (double-encoding).**
   `scrubUrl` compare `key.toLowerCase()` au set sans `decodeURIComponent`
   (`sentry-scrubber.ts:147-155`). Une clé percent-encodée (`%63ode=secret`) ne matche pas
   `SENSITIVE_QUERY_KEYS`. Risque pratique faible (le SDK Sentry et le serveur traitent
   normalement la clé déjà décodée ; une clé encodée ne serait pas non plus reconnue comme
   le param côté serveur). Aucun test de clé encodée.
   **🔧 Fix optionnel** : `decodeURIComponent` défensif sur la clé avant `.has()` (try/catch).

4. **[INFO — non un défaut, à noter] Export sessions : `user_id` brut non pseudonymisé.**
   `streamChatSessions` yield `user_id: row.user_id` (`u.id::text`) en clair
   (`admin-export.repository.pg.ts:96-106`), alors que reviews/tickets pseudonymisent.
   By-design (id numérique DB museum-scopé, pas email), mais incohérence à documenter si la
   CSV sessions peut être recoupée avec une autre source liant id→identité.

---

## 🔧 Reste à faire (priorisé)

1. **P1 — Fermer le trou Langfuse multimodal** (⚠️#1). Vrai egress PII vers tiers cloud sur
   le chemin vision. Patch `stripMessagesArray` + test array-content. ~30 min.
2. **P2 — Replay TOTP atomique** (⚠️#2). Compare-and-swap dans `markUsed` + test concurrence.
   ~1 h. Impact réel borné mais le claim §5.2 doit tenir.
3. **P3 (optionnel) — `decodeURIComponent` dans `scrubUrl`** (⚠️#3). Defense-in-depth.
4. **P3 (doc) — documenter** le choix `user_id` brut dans l'export sessions (⚠️#4).

---

## Synthèse tests adversariaux

| Item | Test adversarial ? |
|---|---|
| Langfuse PII-seed | ⚠️ Partiel — string only, **manque array-content** (= le path prod) |
| TOTP replay | ⚠️ Séquentiel oui, **concurrence non** |
| art-keywords authz | ✅ Visiteur 403 / unauth 401 / admin-mod-superadmin 201 / GET unchanged |
| Sentry scrubber PII | ✅ golden + tags + url-like (parity sentinel) |
| Scraper SSRF | ✅ ssrf-matrix (IPv6 hex bypass, redirect hops, metadata) |
| Denylist fail-open | ✅ failopen test dédié |
| Export salt fail-fast | ✅ prod-validation + no-fallback tests |
| CodeQL #297 | ✅ mfa/sentry/cookie-parser tests touchés |

Pas que du happy-path : la majorité des items ont de vrais tests bypass-attempt. Les 2 trous
réels sont précisément là où le test adversarial s'arrête une étape trop tôt (string vs
array ; séquentiel vs concurrent).
