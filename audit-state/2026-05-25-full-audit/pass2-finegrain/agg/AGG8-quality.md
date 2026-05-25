# AGG8 — Synthèse QUALITÉ DES DIFFS (4 derniers jours, 2026-05-22 → 25)

**Agrégateur** : fresh-context READ-ONLY (UFR-022). Consolidation des reviews pass-1 (clusters B1→B9) + pass-2 (B8b/B9b 2e angle). **Pas de re-vérification code** — synthèse des verdicts existants.
**Branche** : `dev` @ HEAD `89852f2a1` (pass-1) / `1fb32f5ba` (pass-2 B8b/B9b).
**Sources** : 18 reviews (16 pass-1 + 2 pass-2 leaf). Toutes citées par fichier.

---

## 1. Tableau par cluster — note /10 (2 angles) + verdict

| Cluster | Périmètre | Angle 1 (archi/correctness) | Angle 2 (secu/a11y/tests) | Verdict consolidé |
|---|---|---|---|---|
| **B1** | DRY helpers backend (PR-1→16) | **8.0** archi | **8.5** secu/tests | **À RETOUCHER** — 1 blocker correctness (cost-breaker daily-cap defeat) + commentaire faux |
| **B2** | Web refactor DRY P1-4 | **9.0** archi (APPROVED) | **8.5** a11y (APPROVED) | **MERGEABLE** — focus-trap modal déféré V2 (assumé/documenté), pas de blocker |
| **B3** | Chat frontend cluster | **5.0** archi (CHANGES_REQUESTED) | **9.0** a11y (APPROVED) | **À RETOUCHER** — P0 bulle assistant VIDE texte-seul (l'angle a11y l'a raté) |
| **B4** | Lot P0 secu/PII #293 + CodeQL #297 | **8.5** archi (APPROVED) | **7.5** secu | **À RETOUCHER (non-bloquant V1)** — trou Langfuse PII array + TOCTOU TOTP |
| **B5** | Lot P0 GDPR/consent #294 | **8.5** correctness (APPROVED) | **8.5** enforcement | **MERGEABLE avec gaps trackés** — TTS un-gated + scopes profile décoratifs |
| **B6** | Lot P0 feature-gates #295 | **8.5** data (APPROVED) | **7.5** secu (CHANGES_REQUESTED) | **À RETOUCHER** — claim FE faux AdminShell + C8 stats leak global + doc-anchors morts |
| **B7** | Lot P0 a11y/compliance #298 | **8.0** WCAG | **9.1** tests/i18n (APPROVED) | **MERGEABLE avec 2 défauts** — USER bubble masking symétrique non-fixé + live-region always-on |
| **B8** | Burial dead-code + storage | **7.5** (APPROVED w/ reservations) | **8.5** secu/data (B8b) | **MERGEABLE** — réexpose le P0 bulle-vide (latent, pas introduit) |
| **B9** | Deploy & dev-stack | **8.5** (APPROVED) | **7.5** secu (B9b) | **MERGEABLE** — seed-smoke verification_token no-op (defense fantôme) |

**Moyenne pondérée** ≈ **8.0/10**. Sept clusters sur neuf sont mergeables ou mergeables-avec-réserves ; deux (B3, B6) sont en CHANGES_REQUESTED sur au moins un angle.

---

## 2. La valeur de la cross-validation 2-angles (le point central)

La double review a **structurellement attrapé ce qu'un seul angle ratait**. Cas par cas :

### B3 chat — le cas d'école (angle a11y 9.0 APPROVED a raté le P0 que l'angle archi a trouvé)
- **Angle a11y** : 9.0/10, **APPROVED**. Couverture a11y impeccable (Composer buttons, backdrop dismiss, Maestro tap-through réel, i18n 8 locales vérifiées). Aucun trou a11y.
- **Angle archi** : 5.0/10, **CHANGES_REQUESTED**. A repro en Jest exécuté (`RESULT true ASSISTANT_TEXT= "" COUNT 2`) le **P0 bulle assistant vide pour texte-seul** — le chemin le plus courant de l'app — causé par `sendMessageStreaming.ts:117` dont le gate ne se déclenche jamais post-burial SSE.
- **Sans la cross-validation, ce cluster aurait mergé en APPROVED 9.0 avec une bulle de chat vide en prod.** C'est exactement le pattern UFR-021 (test Jest mockait `onToken/onDone` → vert sur code mort). L'angle a11y, focalisé sur les props ARIA, ne pouvait pas voir que la bulle n'a pas de contenu.

### B4 secu — l'angle adversarial a trouvé 2 trous que l'angle archi a sous-estimés
- **Angle archi** : 8.5 APPROVED, traite W1 (cost-breaker) et W2 (TOTP TOCTOU) comme **LOW**.
- **Angle secu** : 7.5, identifie le **trou Langfuse PII array (MEDIUM-HIGH, egress PII réel vers cloud tiers)** que l'angle archi n'a pas vu, et requalifie le TOCTOU TOTP en MEDIUM (claim RFC 6238 §5.2 non tenu sous concurrence). Les deux trous sont précisément "là où le test adversarial s'arrête une étape trop tôt" (string vs array, séquentiel vs concurrent).

### B6 feature-gates — l'angle secu a trouvé 3 problèmes d'honnêteté que l'angle data a classés APPROVED
- **Angle data** : 8.5 APPROVED (migrations propres, museum_id bout-en-bout).
- **Angle secu** : 7.5 **CHANGES_REQUESTED** — claim FE faux dans `AdminShell.tsx` ("per-page scoping confine l'operateur" = correspond à AUCUN code), C8 stats no-op qui leak l'agrégat **global cross-tenant** au museum_manager, et doc-anchors morts référencés 8× (UFR-024).

### B8 burial — la cross-validation a confirmé le P0 B3 ET nuancé son origine
- **B8 (angle archi)** : confirme le P0 bulle-vide, mais ajoute la **nuance d'honnêteté** : le bug n'est PAS introduit par la burial — il préexistait dès que streaming était off (défaut prod par défaut), la burial l'a *cimenté* en supprimant l'échappatoire `streaming=true`.
- **B8b (angle secu/data)** : indépendamment confirme "risque LATENT, PAS introduit par le cluster", zéro régression sécu/data, et identifie le vrai gap : `sendMessageStreaming.ts` n'a **aucun test** alors que c'est le chemin de rendu critique du chat.

### B9 deploy — le 2e angle a confirmé et chiffré le no-op seed-smoke
- **B9 (archi)** et **B9b (secu)** convergent sur le `verification_token: undefined` no-op (defense fantôme), B9b ajoutant la preuve TypeORM 0.3.28 + l'angle mort ESLint (scope `scripts/` hors `.repository.`/`.repo.`) + le compte de prod-account persistant login-able.

**Conclusion** : la cross-validation 2-angles a une valeur **prouvée et non redondante** sur ce lot — elle a transformé 2 APPROVED haute-note (B3 a11y 9.0, B6 data 8.5) en findings bloquants, et trouvé un egress PII réel (B4 Langfuse) qu'un seul angle aurait manqué.

---

## 3. Bugs de qualité réels à corriger

Tous vérifiés par lecture/repro dans les reviews sources. Priorisés par sévérité réelle.

### P0 — bloquants ou quasi (à fixer avant launch)

1. **Bulle assistant VIDE pour message texte-seul** (B3 archi, B8, B8b)
   `sendMessageStreaming.ts:117`. Post-burial SSE, `sendMessageSmart` ignore `onDone` → `streamingIdRef.current` jamais reset → gate `if (response && (!streamingIdRef.current || imageUri))` falsy pour texte-seul → placeholder reste `text:''`. **Repro Jest exécuté** : `ASSISTANT_TEXT= ""`. C'est le chemin le plus courant de l'app. **Nuance honnêteté** : latent pré-burial, cimenté par la burial — à valider sur device avant classement P0 ferme.
   *Fix* : gate `if (response && response.message.text)` indépendant de streamingIdRef, OU supprimer placeholder+callbacks morts (UFR-016). + ajouter assertion contenu bulle (Jest + Maestro fragment réponse, pas écho user).

### P1 — vrais bugs, impact borné V1

2. **Cost circuit-breaker défait le plafond budget JOURNALIER sur recovery HALF_OPEN** (B1 archi HAUTE, B4 archi W1 MEDIUM)
   `three-state-circuit.ts:130-131` → `cost-trip-strategy.ts:63-66` : `recordOutcome('success')` en HALF_OPEN appelle `strategy.reset()` qui wipe `hourlyWindow` **ET** `dailySpend`. Après trip+cooldown+probe saine, le compteur journalier ($500/j) repart à 0 → hard-cap contournable par cycles trip→cooldown→probe (facteur ~2 sur journée à spikes). Le breaker latence est correct (reset failures attendu) ; seul le coût régresse. **Le test l'entérine** (`llm-cost-circuit-breaker.test.ts:121-135` "tiny daily window so the previous trip charge does not survive"). Contredit le claim PR-13 "API byte-identique".
   *Fix* : `CostTripStrategy.reset()` ne wipe QUE `hourlyWindow`, garde `dailySpend`. + test asserter `dailySpend` persiste à travers recovery HALF_OPEN (doit fail aujourd'hui).

3. **Langfuse `stripFreeText` ne couvre PAS le `content` en tableau (multimodal/vision)** (B4 secu MEDIUM-HIGH)
   `strip-free-text.ts:51-62` ne strip `.content` que si `typeof === 'string'`. Or le path vision émet un `HumanMessage` content **tableau** (`llm-prompt-builder.ts:257-261`) embarquant le message user brut → PII (texte user + email/tél tapés) part **intact** vers `cloud.langfuse.com`. C'est exactement le "Vecteur 2" que le lot prétend fermer. Le test PII-seed ne teste que string.
   *Fix* : `stripMessagesArray` gérer `Array.isArray(content)` → strip chaque `{type:'text', text}` (input ET output). + cas test multimodal.

4. **seed-smoke verification_token no-op** (B9 archi MEDIUM, B9b secu MEDIUM)
   `seed-smoke-account.ts:155-160` : `repo.update(id, {verification_token: undefined, ...})` est le gotcha TypeORM documenté — `undefined` filtré, pas de `SET = NULL`. Le commentaire "anti-poison" décrit une defense qui n'existe pas (UFR-013). Angle mort ESLint (`scripts/` hors scope `no-typeorm-set-undefined`). Exploitabilité LOW (account `email_verified:true`, creds = secret GitHub), mais defense fantôme + non testée.
   *Fix* : `() => 'NULL'` (pattern canonique `user.repository.pg.ts:77,116`), élargir scope ESLint à `scripts/`, ajouter assertion régression (set reset_token, re-seed, assert NULL).

### P2 — test-gaps & gaps d'enforcement à tracker

5. **Atomicité Lua rate-limit jamais exécutée par un test** (B1 secu MEDIUM)
   `redis-rate-limit-store.test.ts:24` stub `eval` → le script `INCR_EXPIRE_LUA` n'est jamais run. Atomicité vraie par construction mais claim CHANGELOG "R4 atomic guarantee" validé par argument, pas exécution. Le test "concurrent" (`daily-chat-limit.test.ts:355`) utilise un mock séquentiel JS → ne peut révéler aucune race.
   *Fix* : 1 test integration (ioredis-mock/container) exerçant le vrai script sur les 3 branches.

6. **TOTP replay non-atomique sous concurrence** (B4 archi W2 LOW, B4 secu MEDIUM)
   `markUsed` (`totp-secret.repository.pg.ts:60-62`) = UPDATE inconditionnel sans `WHERE last_used_step < :step`. 2 requêtes concurrentes même code → 2 passent le check (TOCTOU). RFC 6238 §5.2 tenu séquentiellement, pas sous concurrence. Borné par rate-limiter MFA. Aucun test de concurrence.
   *Fix* : compare-and-swap `WHERE (last_used_step IS NULL OR last_used_step < :step)` + check `affected===1` + test `Promise.all` 2 codes identiques.

7. **TTS endpoint NON consent-gated + scopes profile décoratifs** (B5 correctness MEDIUM, B5 enforcement W2)
   `chat-media.route.ts:271-279` envoie le texte assistant à OpenAI TTS sans `isGranted`. + 3 scopes `third_party_ai_profile_*`/`audio_google` affichés FE mais jamais enforced (surface consent FE > surface opposable — risque honnêteté Art.7).
   *Fix* : gate TTS sur scope `audio` OU ADR "generated-text TTS exempt" + test. Masquer/câbler les scopes décoratifs.

### P3 — qualité/cohérence (non-bloquant)

8. **Web focus-trap modal déféré V2** (B2 archi/a11y MEDIUM) — `BaseModal` focus à l'ouverture mais Tab/Shift+Tab s'échappe (WCAG 2.4.3). **Assumé + documenté ADR-067**, triggers nommés (RGAA externe). Acceptable V1 (8 modals admin internes). Le seul vrai gap WCAG du cluster, honnête.
9. **USER bubble masking symétrique non-fixé** (B7 WCAG MEDIUM) — `ChatMessageBubble.tsx:237-238` garde `accessibilityRole="text"`+label statique sur le message USER, défaut identique à celui que le lot vient de fixer pour l'assistant. Non tracké TECH_DEBT. + live-region StreamingBody always-on (risque re-annonce Android).
10. **C8 stats leak global cross-tenant + claim FE faux** (B6 secu MEDIUM) — `getStats.useCase.ts` ignore `museumId`, museum_manager reçoit stats globales ; commentaire AdminShell "per-page scoping" = aucun code ; doc-anchors morts ×8 (UFR-024).
11. **Mapping CC-BY-SA inatteignable** (B6 data MOYENNE) — `Q18199165 → 'cc-by-sa-4.0'` ≠ allow-list `'cc-by-sa'` → œuvre CC-BY-SA toujours rejetée. Documenté "forward-compat" mais piège. Non testé.
12. **Commentaire daily-chat "survive the cutover" faux** (B1 archi FAIBLE) — préfixe `ratelimit:` ≠ legacy key brute. Impact borné (reset minuit UTC).

---

## 4. Verdict global qualité d'ingénierie des 4 jours

**Qualité globale : SOLIDE — 8.0/10 d'ingénierie, avec une discipline d'honnêteté remarquable et 4 corrections réelles avant un launch propre.**

**Forces (récurrentes sur les 9 clusters)** :
- **Honnêteté UFR-013 exemplaire** : divergences documentées plutôt que masquées (B1 `paginate-skip`, B5 "reclassify" pas "fix", B5 deleteAccount "NOT a full DB-cascade", B7 contraste "structurel pas fabriqué", B8 burial claims tous vérifiés exacts, B9 triage CodeQL 6 fixés/16 dismissed avec rationale). Aucune fabrication détectée dans les commit bodies vs code réel.
- **Discipline hexagonale/DRY réelle** : helpers abstraient vraiment leurs call-sites (B1), refactor web byte-for-byte (B2 9.0), migration hexagonale C1 avec sentinel anti-drift post-merge (B3).
- **Fixes au bon chokepoint, pas posés-à-côté** : Sentry beforeSend, Langfuse mask au ctor, consent gate AVANT OpenAI fail-CLOSED, denylist au chokepoint auth (B4/B5). Defense-in-depth réelle (scraper 2-layer, consent text+image+audio transitif).
- **Burials propres et complètes** : zéro orphelin, claims "never wired" vérifiés vrais, migration storage no-overwrite testée (B8/B8b).

**Faiblesses systémiques (le pattern à corriger)** :
- **Le test adversarial s'arrête une étape trop tôt** — c'est LE thème transverse : B3 (texte-seul jamais testé, mock simule path mort), B4 (Langfuse string-only, TOTP séquentiel-only), B6 (analytics-scope mocke le use-case qui jette le param), B9 (token-clear non testé). À chaque fois le test est VERT sur le comportement cassé. C'est le pattern UFR-021 récurrent : *le test mocke l'interaction même qui casse*.
- **Deux gotchas CLAUDE.md re-violés hors de leur scope d'enforcement** : `repo.update({undefined})` (B9 seed-smoke, hors scope ESLint `scripts/`) — preuve que les sentinels doivent élargir leur périmètre.

**Recommandation de merge** : 5 clusters mergeables tels quels (B2, B5, B7, B8, B9 — modulo trackings). 4 corrections avant launch propre : **P0 bulle-vide (B3/B8)**, **cost-breaker daily-cap (B1/B4)**, **Langfuse PII array (B4)**, **seed-smoke no-op (B9)**. Aucune de ces 4 n'est un re-design — toutes sont des fixes ciblés (1-30 lignes) avec un test régression manquant à ajouter. Le lot des 4 jours est du travail d'ingénierie de bonne facture qui a fait une seule erreur récurrente : confondre "test vert" et "comportement vérifié".
