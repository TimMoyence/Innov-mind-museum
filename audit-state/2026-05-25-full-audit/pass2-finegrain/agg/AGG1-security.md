# AGG1 — Synthèse domaine SÉCURITÉ (pass-2 fine-grain consolidation)

> **Agent d'AGRÉGATION READ-ONLY** (UFR-022 fresh-context). NE re-vérifie PAS le code — CONSOLIDE 6 rapports de feuilles pass-2 (`leaf/L01..L06`) et compare aux verdicts pass-1 (`phase-a-roadmap/A1-security.md`, `A2-isec.md`).
> Domaine : P0.A (A1–A9) + P0.I.A (I-SEC1–12).
> Sources : L01 (A1–A3), L02 (A4–A6), L03 (A7–A9), L04 (I-SEC1–4), L05 (I-SEC5–8), L06 (I-SEC9–12).
> Branche d'audit des feuilles : `dev` @ `1fb32f5ba`. Pass-1 : `dev` @ `89852f2a1` (62 commits plus tôt — explique l'écart I-SEC8, voir §3).

---

## 1. Tableau item-par-item — verdict consolidé

| Item | Marqueur roadmap | Pass-1 | Pass-2 (fine-grain) | **Verdict consolidé** | Sévérité résiduelle |
|---|---|---|---|---|---|
| **A1** Email clair → emailDomain | ✅ | DONE | DONE | **DONE** | — (1 résidu LOW `auth-email.route.ts:47`) |
| **A2** DOB bypass curl | ✅ | DONE | DONE | **DONE** | — |
| **A3** Sentry tag URL leak | ✅ | DONE | DONE (left-col path stale, code OK) | **DONE** | — (debt logger no-scrub, voir §2) |
| **A4** Langfuse `stripFreeText` | ✅ | DONE (conditionnel runtime) | **PARTIAL** — array/vision `content` leak | **PARTIAL** | **P1** (P0 si `LANGFUSE_ENABLED=true`) |
| **A5** Version drift Android | ✅ | DONE | DONE (sentinel passe live, 3 gates) | **DONE** | — |
| **A6** Cost breaker `canAttempt()` wired | ✅ | DONE | DONE (enforcement) + **latent hazard** | **DONE + hazard** | **P1** (daily-cap erosion) |
| **A7** Walk path breaker | ✅ | DONE | DONE | **DONE** | — |
| **A8** Honesty docstrings | ✅ | DONE | DONE (a+b) | **DONE** | — |
| **A9** OAuth code/state scrub | ✅ | DONE (subsumé A3) | DONE | **DONE** | — (debt DOC: ancre faux) |
| **I-SEC1** Redis maxmemory | ✅ | DONE | DONE | **DONE** | — (NB: image non pinnée digest, LOW) |
| **I-SEC2** Vision pricing forfait | ✅ | DONE | DONE (wired) | **DONE** | — |
| **I-SEC3** /art-keywords requireRole | ✅ | DONE | DONE | **DONE** | — |
| **I-SEC4** /auth/api-keys forge `msk_` | ✅ | DONE (texte STALE) | DONE — **non-live** | **DONE** | — (prose row mensongère, voir §3) |
| **I-SEC5** EXPORT_PSEUDONYM_SALT | ✅ | DONE | DONE | **DONE** | — |
| **I-SEC6** Login key plaintext/SHA-1 | ✅ | DONE (texte FALSE-CLAIM) | **FALSE-POSITIVE** "live bug" — SHA-1 | **FALSE-CLAIM (bug jamais réel)** | none | 
| **I-SEC7** TOTP replay + denylist | ✅ | DONE | **PARTIAL** — markUsed non-atomique (TOCTOU) | **PARTIAL** | **P2** (LOW, narrow race) |
| **I-SEC8** artwork_knowledge cross-tenant | ❌ | **OPEN (critique)** | **LOW (UX), pas critique** — pas de tenant boundary | **OPEN reclassé LOW** | **P2** (réclassif. ADR-061) ⚠ contradiction inter-pass |
| **I-SEC9** searchTerm retiré queue | ✅ | DONE | DONE (E2E) | **DONE** | — |
| **I-SEC10** Scraper Content-Length 2 couches | ✅ | DONE | DONE | **DONE** | — |
| **I-SEC11** SSRF citation HEAD probe | ↓ | DEFERRED V1.1 (latent) | LATENT (dead-path V1) | **DEFERRED V1.1** | — (pré-cond V1.1, voir §4) |
| **I-SEC12** deps ws/brace-expansion | ✅ | DONE | **PARTIAL** — node_modules local stale | **DONE (lock/CI) + local drift** | **P2** (re-install local) |

**Récap counts (consolidé) :** DONE = 14 · PARTIAL = 3 (A4, I-SEC7, I-SEC12) · FALSE-CLAIM = 1 (I-SEC6, bug jamais réel) · OPEN-reclassé-LOW = 1 (I-SEC8) · DEFERRED = 1 (I-SEC11) · DONE+hazard latent = 1 (A6).

> Note : aucun item n'est un FALSE-CLAIM de **complétude** (pas de ✅ posé sur du non-fait). Les FALSE-CLAIMs sont des descriptions **stale** dans la prose roadmap (bugs décrits comme "live" qui ne le sont pas / ne l'ont jamais été).

---

## 2. NOUVEAUX findings que la pass-1 avait ratés

La pass-2 fine-grain a relevé **5 findings absents (ou minimisés) de la pass-1** :

1. **Logger applicatif sans scrub layer (A1 + A3)** — `museum-backend/src/shared/logger/logger.ts:25-32` fait `JSON.stringify(context)` SANS redaction. `error.middleware.ts:99` (`request_failed`) + `:117` (`auth_4xx`) loggent `path: req.originalUrl` **avec query-string** → OAuth `?code=` / magic-link `?token=` / `?email=` atterrissent en clair dans stdout → agrégation log VPS. **Le sink Sentry est scellé (A3) ; le sink logger NE l'est PAS.** Même racine que le résidu A1. Pass-1 ne l'a pas relevé. **(L01)**

2. **Langfuse array/vision `content` PII leak (A4)** — `stripMessagesArray` (`strip-free-text.ts:51-62`) ne remplace `msg.content` que si `typeof === 'string'` ; **aucune branche pour `content` array**. Or le chemin vision émet `HumanMessage({ content: [{type:'text', text:<user PII>}, {type:'image_url',...}] })` (`llm-prompt-builder.ts:257-262`) → le free-text user transite vers Langfuse **non-redacté**. Zéro test array. Pass-1 a marqué A4 "DONE conditionnel" sans détecter la faille de forme. **(L02)**

3. **Cost-breaker HALF_OPEN recovery wipe `dailySpend` (A6)** — `CostTripStrategy.reset()` (`cost-trip-strategy.ts:63-66`) zéroe `hourlyWindow` ET `dailySpend`. Une recovery déclenchée par un trip HORAIRE remet à zéro le compteur JOURNALIER mid-day → le hard-cap $500/jour (anti "$437/nuit retry loop") devient effectivement contournable par cycles trip/recovery horaires successifs. By-design FSM mais non documenté comme tradeoff, non testé. Pass-1 a marqué A6 DONE sans le détecter. **(L02)**

4. **TOTP `markUsed` non-atomique — TOCTOU replay (I-SEC7)** — flux = `findByUserId` (read) → compare JS → `markUsed` = `repo.update()` **inconditionnel**, sans `WHERE last_used_step < :step`, sans transaction/row-lock. Deux requêtes concurrentes avec le même code valide peuvent toutes deux passer le compare et écrire → la garantie RFC 6238 "reject 2nd use" tombe en concurrence. Contraste : `markEnrolled` (`:44-51`) EST conditionnel — le pattern existait, pas appliqué ici. Pass-1 a marqué I-SEC7 DONE sans mention du TOCTOU. **(L05)**

5. **I-SEC12 node_modules local stale (pins effectifs non résolus)** — `package.json` + `pnpm-lock.yaml` pinnent correctement (`brace-expansion>=5.0.6`, `ws>=8.20.1`) → **CI/prod fresh-install corrects**. MAIS `pnpm list` local résout `ws@8.18.1` + `brace-expansion@{5.0.5,2.1.0,1.1.14}` (sous le floor) ; node_modules stale (mtime antérieur au lockfile). Piège TD-11. Pass-1 a marqué DONE sans valider la résolution effective. Risque **local-only**, pas un blocker prod. **(L06)**

> **Findings de cadrage (pas nouveaux bugs, mais corrections de sévérité) :**
> - **I-SEC8 reclassé OPEN-critique → LOW** : pass-1 (A2-isec) maintenait "SEUL OPEN sécurité critique, V1-blocker" ; pass-2 (L05) démontre qu'**il n'existe AUCUNE frontière tenant** dans `artwork_knowledge` (catalogue public global scrapé, pas de store privé par-musée) → pas d'IDOR/cross-tenant possible (pas de donnée victime de l'autre côté). Résiduel = UX/cohérence + prompt-injection (atténué par `sanitizePromptInput` + isolation structurelle). Conforme ADR-061. **Contradiction inter-pass à trancher — voir §3.**

---

## 3. CORRECTIONS de marqueurs roadmap nécessaires

### 3.1 Incohérences ROW vs BLOC (prose "live" fausse) — UFR-013

- **I-SEC4 (`ROADMAP_PRODUCT.md:229`)** — ROW porte ✅ mais sa **prose dit encore "tout user authentifié (free visitor) forge une clé API B2B `msk_` — no role/tier check"** (bug décrit comme LIVE). Réfuté : gate `requireRole(MUSEUM_MANAGER, ADMIN)` à `auth-api-keys.route.ts:29` → visitor = 403. **Réécrire la prose** en "DONE — gaté requireRole(MUSEUM_MANAGER,ADMIN) `:29`". Le bloc `:70`/`:87` reconnaît déjà la staleness ; la row reste à corriger. **(L04, A2-isec)**

- **I-SEC6 (`ROADMAP_PRODUCT.md:231`)** — ROW décrit un bug PII LIVE "sliding-window Redis key = email plaintext `login-attempts:<raw-email>`, PII keyspace/AOF 10min" (`login-rate-limiter.ts:96`). **FALSE-CLAIM : les deux clés (sliding + lockout) sont SHA-1-hashées** via `hashEmailForKey` (`login-rate-limiter.ts:100-106`). `git show f172ef63b` confirme : déjà hashé au merge-base → **le bug n'a jamais été réel**. Le bloc `:70` ("claim « plaintext » RÉFUTÉ") contredit la row `:231`. **Supprimer/réécrire la row** : "DONE — sliding + lockout SHA-1-hashées, login-rate-limiter.ts:100-106". **(L05, A2-isec)**

- **I-SEC8 (`ROADMAP_PRODUCT.md:233`)** — ROW dit "❌ OPEN / seul OPEN sécurité critique restant" (framing cross-tenant leak). Le bloc `:87` + ADR-061 la déclassent en LOW (doc-only, by-design). **Contradiction interne à trancher** : pass-2 (L05) tranche **LOW** (pas de tenant boundary à franchir). Pass-1 (A2-isec) maintient OPEN-critique-V1-blocker. **Recommandation consolidée : adopter LOW + by-design** (réconcilier la row `:233` avec le bloc `:87`/ADR-061), MAIS conserver l'option de durcissement court-terme (valider l'appartenance de la `row` résolue à la session avant injection prompt — voir §4 debt). **(L05 vs A2-isec — divergence inter-pass explicite)**

### 3.2 Corrections d'ancres / paths (DOC-LOW, futur faux-négatif `doc-anchor-check.mjs`)

- **A9 (`ROADMAP_PRODUCT.md:101`)** — ancre `sentry-scrubber.ts:23-31` INEXACTE pour le backend (re-export ; `:23-31` = `hashEmail`/`scrubEvent`). Vraie source = `packages/musaium-shared/src/observability/sentry-scrubber.ts:29-41`. Au prochain rewrite, **fusionner A9 dans A3** (item non distinct, même fix). **(L03, pass-1 A1/A2)**
- **A3** — left-col cite `error.middleware.ts:94,102,120` + `scrubUrl` ; le code ne call PAS `scrubUrl` dans le middleware (fix placé aux 2 chokepoints `captureExceptionWithContext` + `beforeSend`). Left-col = description stale du *plan* ; right-col + code corrects → pas FALSE-CLAIM mais ancre à rafraîchir. **(L01)**
- **A4** cite `langfuse.client.ts:55`, réel `:68`. **A6** marker quote l'ANCIEN finding ("canAttempt never called") déjà superseded. **I-SEC2** cite `:59`/`:43-59`, réel `:62`. **I-SEC3** cite `:204` (path string), gate réel `:206`. **I-SEC4** cite `:20-42`, gate réel `:29`. Tous drifts cosmétiques de numérotation. **(L02, L03, L04)**

### 3.3 Attribution PR

- **I-SEC4** fix vient de **#294** (`71f103b35`, lot GDPR), PAS #293 (lot sécurité) comme le suggère le regroupement du bloc de correction. **(L04)**
- **I-SEC12** pins ajoutés par **#295** (`811fd501c`, LOT 3 feature-gates), pas #293. Le verdict OPEN du finding D1 était périmé (vérifiait `origin/p0/security`). **(A2-isec)**

---

## 4. Debt priorisée

### P0 (V1-blocker conditionnel)
- **(A4) Langfuse vision/array `content` leak** — P0 **uniquement si `LANGFUSE_ENABLED=true` en prod** (default false aujourd'hui → pas actif). Le flux photo-en-musée = cœur UX V1 ; tout ré-enable prod ship le leak du free-text user. **Fix** : étendre `stripMessagesArray` pour `Array.isArray(content)` → map items, remplacer `item.text` (type:'text') par `STRIPPED`, drop/replace `image_url.url`. Golden test avec la shape exacte `llm-prompt-builder.ts:258`. **(L02)**

### P1
1. **(A1+A3) Logger applicatif sans scrub** — `error.middleware.ts:99,117` loggent `req.originalUrl` brut (query-string PII : code/token/email) en stdout. Sentry scellé, logger ouvert. **Fix** : router l'URL via `scrubUrl` avant log, OU wrapper redaction sur `logger`. **(L01)**
2. **(A6) Cost-breaker daily-cap erosion** — `CostTripStrategy.reset()` zéroe `dailySpend` à la recovery HALF_OPEN (même depuis un trip horaire) → cap $500/jour contournable. **Fix** : split `reset()` en `resetHourly()` (recovery) vs `resetAll()` (rollover UTC) ; le daily est un invariant indépendant du même jour UTC. Test : "daily spend survives hourly-trip HALF_OPEN recovery same UTC day". **(L02)**

### P2
3. **(I-SEC7) TOTP `markUsed` TOCTOU** — `TD-SEC-TOTP-ATOMIC-01`. Convertir en UPDATE conditionnel (`WHERE last_used_step IS NULL OR last_used_step < :step`) + re-check `affected`, OU transaction `SELECT ... FOR UPDATE`. Narrow window (rate-limit per-user + TTL code ±60s) → LOW, pas blocker V1. **(L05)**
4. **(I-SEC12) node_modules local stale** — `TD-ISEC12-01`. `cd museum-backend && pnpm install` pour resync local avec le lockfile pinné. Aucune modif de fichier tracké. Local-only. **(L06)**
5. **(I-SEC8) Reclassif. + durcissement optionnel** — réconcilier roadmap `:233` (LOW/by-design vs ❌ critique). Durcissement non-requis V1 : valider que `currentArtworkId` résout vers une row existante (shape-only aujourd'hui) avant persist (ADR-061 §Negative). `TD-SEC-MULTI-TENANT-01` re-devient réel SI V2 ajoute un store privé par-musée. **(L05)**
6. **(A1) Résidu PII** — `auth-email.route.ts:47` `metadata: { newEmail }` brut → appliquer `extractEmailDomain`. LOW, pré-existant, roadmap-connu. **(L01, pass-1)**

### DOC / process (non-code)
- Réécrire prose rows I-SEC4 (`:229`) + I-SEC6 (`:231`) — bugs "live" faux (UFR-013). **§3.1**
- Réconcilier row I-SEC8 (`:233`) avec bloc `:87`/ADR-061. **§3.1**
- Corriger ancre A9 (`:101`) + fusionner A9→A3 ; rafraîchir ancres A3/A4/A6/I-SEC2/I-SEC3/I-SEC4. **§3.2**

### Pré-conditions différées (V1.1)
- **(I-SEC11)** Avant d'activer `urlHeadProbe`, valider host/IP du HEAD (deny private/link-local/metadata) — sinon ré-ouverture SSRF via URLs de citation LLM. À vérifier dans `url-head-probe.ts` au rollout. **(L06, A2-isec)**

---

## 5. Divergences inter-pass notables (pass-1 vs pass-2)

| Item | Pass-1 | Pass-2 | Résolution consolidée |
|---|---|---|---|
| **I-SEC8** | OPEN critique, V1-blocker | LOW (UX), pas de tenant boundary | **LOW + by-design** (ADR-061 cohérent) ; durcissement optionnel non-bloquant |
| **A4** | DONE (conditionnel) | PARTIAL (array leak) | **PARTIAL** — nouveau finding pass-2 fondé |
| **A6** | DONE | DONE + hazard latent | **DONE + debt P1** (hazard réel, by-design non documenté) |
| **I-SEC7** | DONE | PARTIAL (TOCTOU) | **PARTIAL** — debt P2, narrow window |
| **I-SEC12** | DONE | PARTIAL (local stale) | **DONE lock/CI + debt P2 local** |
| **A8** | DONE (corrige PARTIAL findings D1) | DONE | **DONE** — findings D1 citait branche pré-merge obsolète |

La pass-2 fine-grain est **strictement plus stricte** : 5 items que pass-1 cochait DONE/critique sont nuancés (A4, A6, I-SEC7, I-SEC12 plus stricts ; I-SEC8 moins alarmiste). Aucune régression de verdict dans l'autre sens. L'écart de HEAD (89852f2a1 → 1fb32f5ba, 62 commits) n'explique aucune divergence sécurité (les fichiers concernés n'ont pas re-bougé) — les écarts sont de la profondeur d'analyse, pas du drift de code.
