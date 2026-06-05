# 📋 Rapport d'audit complet — Musaium V1 (2026-05-25, J-13 launch)

> **Format « professeur »** : ce que vous avez construit, ce qui est solide, ce qui doit être corrigé et **pourquoi**, puis les prochaines étapes priorisées.
> **Méthode** : 32 sous-agents fresh-context read-only (UFR-022) + 4 vérifications personnelles de l'orchestrateur sur les claims à fort enjeu. Cross-validation 2 angles/cluster (UFR-025). Toute affirmation = `path:line` reproductible (UFR-024). Branche `dev` @ `89852f2a1`.
> **Périmètre** : (A) réalité roadmap item-par-item rafraîchie vs les 62 commits des 4 derniers jours ; (B) review qualité des diffs par cluster, double-angle ; (C) tracing E2E entrée→data de 14 features.

---

## 0. Le verdict en une page

**La base de code est de bonne qualité d'ingénierie (note moyenne des clusters ≈ 8/10), avec une discipline hexagonale, des tests souvent adversariaux et une honnêteté de documentation réelle.** Le travail P0 de sécurité/GDPR/feature-gates des 4 derniers jours (#293/#294/#295) est massivement *fait et mergé*, contrairement à ce que la roadmap laissait croire par endroits.

**MAIS l'audit a trouvé ce que 148 agents d'audits précédents (orientés "item fait ?") avaient manqué : des ruptures de flux E2E sur des chemins utilisateurs réels.** Le plus grave : **le chat texte-seul rend une bulle assistant vide** sur `dev` courant. Aucun audit roadmap ne l'avait vu parce qu'aucun ne *traçait le flux runtime* — ils vérifiaient la présence du code, pas son comportement bout-en-bout.

**La leçon centrale** (pour vos élèves) : *« le code existe et les tests sont verts » ≠ « la feature marche ».* Les deux découvertes majeures (bulle vide, MFA verrou) sont passées sous des tests verts qui mockent précisément l'interaction qui casse.

### Top blockers / quasi-blockers launch (détail §3)
| # | Sévérité | Problème | Preuve |
|---|---|---|---|
| 1 | 🔴 **P0 suspect** | Chat **texte-seul → bulle assistant vide** (image OK, audio OK) | `sendMessageStreaming.ts:117` + `send.ts:169-172` |
| 2 | 🔴 HIGH | **MFA mobile = verrouillage** : enroll monté, challenge screen orphelin | `MfaChallengeScreen.tsx` (0 importeur) + `app/(stack)/mfa-enroll.tsx` |
| 3 | 🔴 HIGH (GDPR) | **Consent `location_to_llm` contourné** : coords brutes au LLM si refus | `prepare-message.pipeline.ts:482` + `llm-prompt-builder.ts:196-200` |
| 4 | 🟠 HIGH | **KR2 NPS non livré** : `aggregateNps()` dead-code + StarRating plafonné à 5 | `review.repository.pg.ts:88` + `StarRating.tsx:31` |
| 5 | 🟠 HIGH | **14/30 images daily-art cassées** (Mona Lisa, Guernica…) | `artworks.data.ts` (curl vérifié) |
| 6 | 🟠 MED | **Pas d'alerte backend/DB/Redis down** (I-OPS2) + cap coût anon-bypass (I-FIX3) | `infra/grafana/alerting` + `llm-cost-guard.ts:103` |
| 7 | 🟠 MED | **Rôle `museum_manager` cassé** : 1 page qui fuit l'agrégat global + 7 liens nav → 403 | `getStats.useCase.ts:24` + `admin.route.ts` |
| 8 | 🟡 honnêteté | **`LOT-P0-STABILITY-CLOSURE.md` committé aujourd'hui prétend LOT 4 fait — le code n'est PAS sur `dev`** | findings/A5 |

---

## 1. Ce qui a été fait — et bien fait (les forces)

> Pédagogie : on commence par reconnaître la qualité, c'est réel et ça motive.

### 1.1 Discipline d'ingénierie (clusters B — notes 7.5–9.1/10)
- **Refactor DRY backend (PR-1..16) — 8.0–8.5/10.** Helpers au bon niveau hexagonal (`@shared/http/errors`, `@shared/pagination`, `@shared/audit`), primitives pures avec dépendances injectées (`now()`, `fetchImpl`). `extractEmailDomain` retire la PII **partout** (grep `.split('@')` = 0 résidu). Single-use email tokens **étanches au replay** (`UPDATE … WHERE token AND expiry>NOW() RETURNING *` + `()=>'NULL'`).
- **Refactor web (phases 1-4) — 8.5–9.0/10.** `apiPut` résout le piège CLAUDE.md (CSRF + credentials auto) ; `useFetchData` gère l'AbortController **sans race** (double garde `signal.aborted` + cleanup unmount, testé StrictMode double-mount) ; `BaseModal` a11y `role=dialog`+`aria-modal`+ESC. 622 tests verts (exécuté).
- **Lot a11y #298 — 8.0–9.1/10.** I-CMP1 contraste recalculé sur le vrai backdrop (9.4:1 light / 5.7:1 dark vs 3.95:1 avant) ; skip-link web complet ; de-flake e2e = root-cause (`waitFor visible` avant `count`, pas un `sleep`). i18n 8/8 locales vérifié.

### 1.2 Sécurité chat (défense en profondeur réelle)
Les **6 couches** de sécurité chat sont **bien ordonnées** (vérifié E2E C1) : keyword guardrail → isolation structurelle `[END OF SYSTEM INSTRUCTIONS]` + Spotlighting → sanitize → LLM Guard sidecar → LLM judge → output guardrail. Consent gate **fail-CLOSED avant** persist/enrichment/LLM, avec tests **adversariaux** (refus → `persistMessage` non appelé, enrichment=0, zéro LLM).

### 1.3 GDPR (B5 — 8.5/10)
DSAR export **matériellement complet** (11 catégories, allow-list par champ). Erasure vérifiée **au niveau FK SQL** (`ON DELETE CASCADE` sur les 6 tables) + cleanup externe (S3/audio/Brevo) **avant** wipe DB. DOB hard-required (plus de bypass `.optional()`). Subprocessors centralisés (`privacy-content.canonical.json`, sentinelle verte).

### 1.4 Le travail P0 EST fait et mergé (vérité rétablie)
Contrairement à ce que des claims STALE laissaient croire : **LOT 1 sécurité (#293), LOT 2 GDPR (#294), LOT 3 feature-gates (#295) sont tous sur `dev`** (vérifié `merge-base --is-ancestor`). Les "branches `p0/*`" sont des reliquats pré-merge. La roadmap **ne mentait pas sur la complétude** — elle traînait des descriptions de bugs déjà corrigés.

---

## 2. Réalité roadmap : la roadmap était re-périmée en ~6h (Phase A)

> Pédagogie : une roadmap est un document **vivant** ; les commits d'aujourd'hui (LOT 5 a11y #298, LOT 6 burial PR#299) ont fermé des items que la roadmap marquait encore ❌. **11 cases à cocher.**

| Item | Roadmap | Réalité au HEAD | Action |
|---|---|---|---|
| I-CMP1, I-CMP2, I-CMP3, I-CMP5 | ❌ | ✅ fermés (#298 ; I-CMP2 par #294) | **cocher ✅** |
| I-CMP6 | ❌ | ⚠️ BE+web attestés, gap mobile EAS (CRA 2027) | **⚠️** |
| P0.D1 (SSE burial) | ⚠️ | ✅ −1093 LOC, flag retiré | **✅** |
| P0.D2 (stryker 18.5MB) | ❌ | ✅ untracked | **✅** |
| P0.D3 (llama-guard 571 LOC) | ❌ | ✅ supprimé | **✅** |
| P0.D4 (3 describe.skip) | ⚠️ | ✅ supprimés (238 LOC) | **✅** |
| P0.D5 (ADR-036 v2, AiDisclosure) | ⚠️ | ✅ corrigés | **✅** |
| TD-AS-01 (AsyncStorage) | ❌ | ✅ namespacé + reader no-overwrite | **✅** |
| Exit-criteria §8 "LOT6 non démarré" | ❌ | **FALSE-CLAIM** | **réécrire ✅** |
| 6 items NOW V1.0.x | `[ ]` | DONE-mais-pas-cochés (C10 race, Switch label, 5 WCAG, audit email domain, salt prod, Grafana per-stage) | **cocher [x]** |
| P0.B11 (EXIF boot assert) | ✅ | ⚠️ wiring OK mais boot-assert absent | **rétrograder ⚠️** |

**Items confirmés OPEN (vrais restes)** : I-SEC8 (LOW, voir §4), I-OPS2/3/4/6/7 + I-FIX3 (LOT 4 stabilité, **jamais démarré** malgré le .md trompeur), I-CMP6-mobile (CRA 2027), ops-humain B12/B13/B14/B19 + C7.5.

**Faux-claims de prose à corriger (UFR-013)** : I-SEC4 / I-SEC6 décrivent des bugs "live" qui sont fixés ou n'ont jamais existé (le code réfute). Doc-anchors `c4b-sparql-counts.md` / `c2-license-uris.md` référencés 8× mais **inexistants** (working-dir éphémère supprimé) → UFR-024 cassé.

---

## 3. Les problèmes trouvés — par sévérité, avec le « pourquoi »

### 🔴 3.1 Chat texte-seul → bulle assistant vide (P0 suspect, à confirmer device)
**Le bug.** `sendMessageSmart` (`send.ts:169-172`) est désormais sync-only et **n'appelle jamais `onDone`**. Or le consommateur `sendMessageStreaming.ts:44` pose `streamingIdRef.current = placeholderId` (truthy) et ne le reset que dans `onDone`. À la ligne 117, le bloc qui remplit la bulle ne s'exécute que si `(!streamingIdRef.current || imageUri)` — pour un **texte-seul**, c'est `(false || undefined)` = **false** → le placeholder reste `text:''`.
**Pourquoi non détecté.** Le flow héro est *photo-first* (le path image marche, `imageUri` sauve la garde). Les tests verts mockent `sendMessageSmart` en appelant `onDone` manuellement (`useChatSession.test.ts:773`) — c'est-à-dire **le chemin mort en prod**. Le test texte-seul (`:214`) asserte que l'API est *appelée*, jamais que la bulle reçoit le texte — alors que les tests audio (`:421`) et image (`:485`) **assertent** le texte. Asymétrie = false-green.
**Confirmé par** : trace byte-level (orchestrateur) + 3 agents indépendants (B3-archi avec repro Jest, B8, C1). Le BE génère et persiste bien la réponse (`message-commit.ts:211`).
**Nuance honnête** : le consommateur est byte-identique pré/post-burial et le flag `EXPO_PUBLIC_CHAT_STREAMING` (défaut `false`, absent des env) faisait déjà du sync en prod → techniquement **pré-existant**, la burial a juste retiré le path streaming qui aurait pu le masquer. **Action #1** : confirmer sur device/par test, puis corriger la garde `:117` (consommer `response.message.text` inconditionnellement en sync) + ajouter un test assertant le texte assistant texte-seul + 1 flow Maestro.

### 🔴 3.2 MFA mobile = verrouillage de compte (HIGH)
`app/(stack)/mfa-enroll.tsx` permet d'**activer** la MFA, mais `MfaChallengeScreen.tsx` n'est **importé/monté par aucun fichier** → au login suivant, `authApi.ts` throw `MFA_REQUIRED`, laissé en erreur brute, **aucune route ne mène à l'écran de challenge**. *Pourquoi ça compte* : une feature de sécurité qui **brique le compte** est pire que pas de feature. **Action** : router `MfaChallengeScreen` OU masquer l'enroll en V1 si la MFA n'est pas un flow B2C launch.

### 🔴 3.3 Consent location_to_llm contourné (HIGH, GDPR Art.7)
Le gate ne nullifie que la location *résolue* (`resolvedLocation`), mais `prepare-message.pipeline.ts:482` passe `context.location` (coords brutes du FE) **inconditionnellement**, et `llm-prompt-builder.ts:196-200` les envoie au LLM en fallback quand le consent est refusé. **Inversion perverse** : refuser → coords brutes ; accorder → coarse ville. *Pourquoi non vu avant* : B5 a vérifié que le resolver est gated (vrai) ; seul un tracing E2E (C3) a vu le fallback. **Action** : ne ship aucune location si `resolvedLocation` absent ET consent refusé (gcommer le fallback brut, ou le coarsen).

### 🟠 3.4 KR2 NPS non livré (HIGH produit)
`aggregateNps()` + `findByMuseum()` (`review.repository.pg.ts:88-107`) = **zéro caller** ; le `/stats` public renvoie un AVG global, pas un NPS. Et `StarRating.tsx:31` plafonne à **5 étoiles** → l'app ne peut **structurellement pas produire un 0-10**. Donc l'OKR **KR2 (NPS ≥7/10)** est non-mesurable aujourd'hui malgré la colonne `museum_id` ajoutée (#295). *Plomberie écrite, jamais câblée.* **Action** : câbler l'échelle 0-10 mobile + exposer `aggregateNps` par musée, OU descoper KR2 honnêtement.

### 🟠 3.5 14/30 images daily-art cassées (HIGH UX)
Vérifié par curl (UA navigateur + Referer identiques aux URLs qui passent) : ~47% des jours affichent l'icône fallback, dont **Mona Lisa** (index 0, l'œuvre la plus exposée) et Guernica (404). Aucun sentinel CI ne valide ces URLs → c'est ainsi qu'elles ont pourri. **Action** : re-sourcer les URLs (Wikimedia Commons stable) + sentinel CI de liveness + envisager du contenu i18n (actuellement EN-only).

### 🟠 3.6 Stabilité / observabilité (LOT 4 — jamais démarré)
- **I-OPS2** : aucune alerte API 5xx / `up{backend}==0` / DB-down / Redis-down → un crash ne page personne. **Vrai gap KR3.**
- **I-FIX3** : cap coût = $0.002 **par requête HTTP** (pas par fan-out), **anon bypass** (`llm-cost-guard.ts:103`), judge fail-OPEN à budget épuisé (régression sécu déguisée en cap). STT/TTS non métrés.
- I-OPS3 (migrations 2×, conditionnel), I-OPS6 (pgvector ≥0.7.0 jamais gaté — confirmé C6), I-OPS7 (indices manquants, P1/scale).
- **⚠️ Honnêteté** : `LOT-P0-STABILITY-CLOSURE.md` (committé aujourd'hui `0349095c5`) prétend ces items fixés sur branche `p0/stability` — **aucun code sur `dev`** (SHAs non-ancêtres, fichiers introuvables). Un .md committé sans le code = exactement ce que UFR-013 interdit. **Action** : corriger/retirer ce .md, démarrer réellement LOT 4.

### 🟠 3.7 Multi-tenant `museum_manager` cassé (MED — latent V1 B2C, bloquant pré-B2B)
- **C8 stats leak** : `getStats.useCase.ts:24` ignore `museumId` → un `museum_manager` voit l'agrégat **global cross-tenant** (totalUsers incl. admins, sessions, messages). Le scope route est cosmétique.
- **Rôle incohérent** : la nav FE expose 8 liens à `museum_manager` mais le BE n'autorise que `/stats` → 7 liens → 403, dont la modération (/tickets, /reviews).
- **Branding W2.2 write-to-void** : `branding/page.tsx` écrit `config.branding` mais **0 consumer** (ni BE schema, ni mobile FE) ; le sous-titre "takes effect on next visitor session" est un **claim faux**.

### 🟡 3.8 Défauts de qualité plus fins (cross-validation B)
- **Cost circuit-breaker** : la recovery HALF_OPEN appelle `strategy.reset()` qui **wipe le `dailySpend`** (`three-state-circuit.ts:128` → `cost-trip-strategy.ts:63`) → le hard-cap $/jour est affaibli ~2× sur une journée à spikes. Triple-confirmé (B1, B4). Le test entérine la régression. Non-blocker V1 (single-instance), à fixer avant scale.
- **Langfuse PII egress** : `stripFreeText` ne masque que `content` *string*, pas le `content` **tableau** (path vision `[{type:text},{type:image_url}]`) → texte user (PII) part vers cloud.langfuse.com. Le test PII-seed ne teste que string. MEDIUM si Langfuse activé prod.
- **TTS non consent-gated** (`chat-media.route.ts:271`) ; **3/8 scopes third_party_ai décoratifs** (l'UI affiche des contrôles que le BE ignore — Art.7 transparence).
- **TOTP TOCTOU** : `markUsed` non-atomique (pas de compare-and-set) → replay sous concurrence (borné par limiter 5/15min).
- **CC-BY-SA rejeté** (`catalog-ingest.helpers.ts:58` mappe vers `cc-by-sa-4.0` mais l'allow-list n'a que `cc-by-sa`) — **inerte en V1** (allow-list = public-domain + cc-0 seulement), dead forward-compat.
- **Leads non-durables** : Brevo = SPOF, pas de table locale → lead perdu si Brevo down (throw 500 avant le 202). OpenAPI `/leads/*` absent.
- **Tests d'atomicité Lua jamais exécutés** (mock canned) ; RTL borders bug `SwipeableConversationCard.tsx:121`.

---

## 4. Réconciliations d'honnêteté (disputes résolues entre agents)

> Pédagogie : quand deux experts indépendants divergent, on ne tranche pas par autorité — on relit le code.

1. **I-SEC8 (knowledge cross-tenant)** — A2 disait CRITIQUE, B5+C6 disent LOW. **Verdict : LOW-MEDIUM.** `artwork_knowledge` = catalogue **public scrapé** (faits Wikidata), pas de donnée privée multi-tenant. ADR-061 le classe déjà LOW. Gap d'isolation réel (asymétrie vs `artwork_embeddings` qui est scopé), à documenter avant B2B + `roomId` intra-musée, mais **pas un blocker V1**. Fix optionnel ~10 lignes (`row.museumId === session.museumId`).
2. **Chat bulle-vide** — B3-a11y (9/10 APPROVED) l'avait **manqué** ; B3-archi + B8 + C1 l'ont trouvé. **L'angle qui trace le runtime gagne sur l'angle qui fait confiance au commit.** C'est la valeur exacte de la cross-validation 2-angles que vous avez demandée.
3. **Location consent** — B5 (gate solide) vs C3 (bypass). **Les deux ont raison** sur des couches différentes ; le bug net (C3) tient.

---

## 5. Mise à jour roadmap + repriorisation (appliquée)

Voir `roadmap-ticks.md` pour le diff exact. Synthèse :
- **11 cases cochées** (LOT 5 + LOT 6 + 6 NOW + exit-criteria).
- **1 rétrogradation** (B11 ✅→⚠️).
- **Nouveaux items ajoutés** (les 8 findings du tableau §0 + les défauts §3.8) injectés dans NOW V1.0.x ou P0 selon sévérité.
- **Prose corrigée** : I-SEC4/I-SEC6 (faux-claims), doc-anchors C4b/C2 (retirés ou à committer), `LOT-P0-STABILITY-CLOSURE.md` (claim trompeur).

### Priorisation recommandée (J-13 → launch)
**P0 launch (à traiter in-session, pas à documenter) :**
1. Chat texte-seul bulle-vide — confirmer device + fix garde + test (§3.1).
2. MFA mobile — router le challenge OU masquer l'enroll V1 (§3.2).
3. Consent location bypass — couper le fallback brut (§3.3).
4. I-OPS2 alertes backend/DB/Redis down + I-FIX3 cap coût anon (§3.6).
5. Daily-art images cassées (Mona Lisa !) + sentinel liveness (§3.5).

**P0.5 (décision produit rapide) :**
6. KR2 NPS : câbler 0-10 + per-museum, OU descoper honnêtement (§3.4).
7. `museum_manager` : aligner FE/BE allow-list OU retirer le rôle de la nav V1 (§3.7).

**P1 (avant scale / hotfix window) :** cost-breaker dailySpend, Langfuse PII array, TTS consent, TOTP TOCTOU, leads durabilité, I-SEC8 doc, scopes décoratifs, branding claim.

**Ops humain (Tim) :** B12 PGP, B13 mailbox security@, B14 DPA Langfuse, B17 **révoquer la clé Anthropic réelle toujours dans `.env`**, B19 S3 PAB, C7.5 device TTS.

---

## 6. Note méthodologique pour vos élèves

- **Trois vagues d'audit antérieures (148 agents) ont validé "l'item est fait" mais raté 3 ruptures E2E** : parce qu'elles vérifiaient la *présence du code*, pas le *comportement bout-en-bout*. Le tracing entrée→data (Tâche 3) est ce qui a payé.
- **Les tests verts peuvent mentir** quand ils mockent l'interaction qui casse (bulle-vide, MFA). Règle : un test doit exercer le *vrai* chemin de prod, pas une simulation pratique.
- **La cross-validation 2-angles n'est pas du gaspillage** : sur le cluster chat, un angle a APPROVED (9/10), l'autre a trouvé un P0. Sans le second, le bug shippait.
- **L'honnêteté est une discipline active** : un `.md` "closure" committé sans le code (§3.6) est un mensonge structurel, même non intentionnel. Le marqueur fait foi seulement si le `path:line` résout.

---

*Sources détaillées : `phase-a-roadmap/A1-A9.md`, `phase-b-diffs/B1-B9*.md`, `phase-c-e2e/C1-C10.md`. Chaque finding = verdict + `path:line` + confiance.*
