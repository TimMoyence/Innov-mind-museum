# AGG7 — Synthèse E2E full-audit (agrégation READ-ONLY)

**Date** : 2026-05-25 · **Rôle** : agrégateur fresh-context (UFR-022) · consolidation de 16 rapports de feuilles, pas de re-vérif code.
**Sources** : pass-1 E2E `phase-c-e2e/C1..C9` ; pass-2 unbundle FE `pass2-finegrain/leaf/C10a..C10g`.
**Note de branche** : pass-1 (C1-C9) tracé @ HEAD `89852f2a1` ; pass-2 (C10*) @ HEAD `1fb32f5ba`. Léger décalage de HEAD entre les deux passes — aucune contradiction de findings relevée, mais à garder en tête.

---

## 1. Tableau de santé par feature

| # | Feature | Santé /10 | Rupture principale |
|---|---|---|---|
| C1 | Chat (voice-first, in/out musée) | **4/10** | **Bulle assistant VIDE sur texte-seul** — `onDone` jamais appelé en prod + garde morte `sendMessageStreaming.ts:117` → placeholder `text:''` rendu. 100% reproductible 1er affichage. BE persiste bien. |
| C2 | Auth (register/login/MFA/OAuth/DSAR) | **7.5/10** | **MFA challenge mobile = dead-end** — enroll réussit, mais login `mfaRequired` throw une string, aucune route `mfa-challenge`, `MfaChallengeScreen` jamais monté → user enrôlé verrouillé hors de l'app. |
| C3 | Museum / géoloc / détection lieu | **6/10** | **Consent `location_to_llm` bypassé** — fallback raw-coords `llm-prompt-builder.ts:196-200` envoie GPS EXACTES au LLM même quand consent refusé (pire que le coarse autorisé). GDPR. |
| C4 | Daily-art (œuvre du jour) | **5/10** | **14/30 URLs images cassées** (HTTP 400/404, dont #1 Mona Lisa = jour le plus exposé). ~47% des jours = fallback icône, zéro détection CI. |
| C5 | Paywall / quota / tier | **8/10** | Soft-paywall bloque réellement, atomique, RGPD-soigné. Faiblesses : `quota_exceeded` BE-emit non gaté consentement (asymétrie), pas de display de tier côté app. |
| C6 | Knowledge-extraction + image-compare | **6/10** | **`useCompareImage` FE orphelin** (0 consommateur) → compare non-déclenchable côté mobile, BE + rendu complets mais path trigger mort. + pgvector ≥0.7 non gaté prod. |
| C7 | Review (NPS) + support | **5/10** | **NPS non livré** — `aggregateNps`/`findByMuseum` = DEAD CODE (0 caller), `StarRating` plafonne à 5 (buckets 9-10/7-8 toujours vides), scope read admin non appliqué. |
| C8 | Admin panel + telemetry | **6/10** | **`museum_manager` cassé** — `getStats` ignore `museumId` (leak agrégat global cross-tenant) + 7/8 nav links 403 + branding write-only sans consommateur. Latent V1 (B2C-only, zéro musée contracté). |
| C9 | Leads (B2B + Brevo) | **6.5/10** | **Leads non durables** — Brevo = SPOF, AUCUNE table locale/queue/retry. Brevo down → 500, lead définitivement perdu. + OpenAPI `/leads/*` absent. |
| C10a | Conversation (liste/historique) | **8.5/10** | Swipe-delete d'une session NON-vide : BE `deleted:false` mais FE retire la carte → réapparaît au refresh (UX piégeuse, by-design). |
| C10b | Home | **8/10** | `onChooseAnother` non câblé → bouton « Choose another » de la confirm-sheet = dismiss silencieux (affordance trompeuse). + daily-art toujours fetché `en`. |
| C10c | Settings | **6.5/10** | **5 settings local-only** (audioDescription, locale, museumMode, guideLevel, dataMode) — `PATCH /me/preferences` BE complet mais ZÉRO call-site FE → sync cross-device cassé. |
| C10d | Onboarding (first-launch) | **7/10** | Maestro `onboarding-flow.yaml` STALE actif en CI (assert slides 3-impl disparus). + `useTypewriter` orphelin. Onboarding posé APRÈS auth. |
| C10e | Legal (privacy/terms/AI disclosure) | **9/10** | WIRED, release-ready. 1 obs LOW : 6 labels metadata privacy hard-codés EN (non-`t()`). |
| C10f | Diagnostics (FPS/MapLibre HUD) | **9/10** | WIRED-DEV-ONLY, 4 gates `__DEV__`, aucune fuite, aucun risque sécu. Pas de rupture. |
| C10g | Art-keywords (taxonomy) | **9/10** | WIRED full E2E, POST gaté I-SEC3, classifier consommé. 1 finding cosmétique (`isStale` orphan). |

---

## 2. Ruptures launch-critiques (les 8 du brief, confirmées)

Chaque rupture ci-dessous a été **confirmée par sa feuille** avec `path:line`. Verdict synthèse :

### P0 — bloquants happy-path / GDPR / sécurité

1. **C1 — Chat bulle assistant VIDE (texte-seul)** — CRITICAL, V1-blocker.
   - Chaîne : `send.ts:169` prod-wire ignore `onDone` → garde `sendMessageStreaming.ts:117` `(!streamingIdRef.current || imageUri)` = falsy pour texte-seul → bloc de remplissage sauté → placeholder `text:''` rendu (`ChatMessageBubble.tsx:133/149`).
   - **Path le plus courant (texte hors musée) ne rend aucune réponse au 1er affichage.** Test masque le bug (mock appelle `onDone` manuellement — cas d'école DOB-2026-05-17, UFR-021).
   - Fix : retirer la garde morte L117 OU restaurer un vrai `onDone`. **In-session (V1-blocker, ne pas documenter pour plus tard).**

2. **C3 — Consent `location_to_llm` bypassé par fallback raw-coords** — HAUTE, GDPR.
   - `llm-prompt-builder.ts:196-200` : quand consent refusé → `resolvedLocation` undefined → builder retombe sur `context.location` brut = `"lat:44.83,lng:-0.57"` (coords EXACTES, plus précises que le coarse autorisé) envoyé au LLM tiers.
   - Fix : nullifier `context.location` quand consent refusé OU supprimer la branche raw-coords (aucune valeur GDPR).

3. **C2 — MFA verrou mobile (enroll → challenge dead-end)** — HIGH.
   - `authApi.ts:54-65` throw `Error('MFA_REQUIRED')`, aucune nav vers `MfaChallengeScreen` (composant existe, aucune route Expo, jamais monté). User enrôlé = verrouillé. Web admin idem.
   - Atténuation : MFA opt-in B2C V1 (forcé seulement admin/super_admin), mais l'enroll mobile EXISTE → piège atteignable.

### P1 — data integrity / produit / durabilité

4. **C4 — Daily-art images cassées** — HAUTE.
   - 14/30 URLs Wikimedia HTTP 400/404 (vérifié curl), dont #1 Mona Lisa (jour le + exposé). ~47% des jours = fallback icône. Aucun sentinel CI ne vérifie les 200.

5. **C7 — NPS non livré** — HAUTE (KR2 descopé de facto).
   - `aggregateNps()`/`findByMuseum()` = DEAD CODE (0 caller, BE/web/FE). `StarRating` plafonne à 5 → buckets promoters(9-10)/passives(7-8) toujours vides → NPS mobile = toujours -100%. Public `/stats` = AVG global, pas NPS. Soit câbler, soit enterrer (UFR-016).

6. **C8 — museum_manager cassé** — HIGH-if-exploited / latent V1.
   - `getStats` ignore `museumId` → agrégat global cross-tenant (BOLA/API3). + 7/8 nav links 403. + branding write-only sans consommateur (claim "takes effect next visitor session" = faux). **Latent : B2C-only, zéro musée contracté** → pas de compte museum_manager réel aujourd'hui.

7. **C10c — Preferences sync local-only** — MEDIUM.
   - `PATCH /me/preferences` BE complet (schema/useCase/repo/audit) mais ZÉRO call-site FE → 5 settings device-local. Sync cross-device cassé. Read serveur OK (bootstrap), donc l'asymétrie est masquée. Trancher : câbler OU enterrer le schema BE (route morte = faux signal de capacité).

8. **C9 — Leads non durables** — HAUTE.
   - Brevo = SPOF, aucune table/queue/retry. Brevo down → `subscribe`/`notify` throw avant `res 202` → 500 → lead perdu définitivement. Canal de capture pré-launch sans durabilité.

---

## 3. Patterns transverses (récurrents sur ≥2 features)

### P-A — Endpoints/capacités BE existants sans call-site FE (FE-trigger mort)
Le motif dominant de l'audit : le backend implémente, le FE ne déclenche jamais.
- **C10c** : `PATCH /api/auth/me/preferences` complet BE → 0 call-site FE (5 settings local-only).
- **C6** : `useCompareImage` / `imageComparisonApi` → 0 consommateur → compare non-déclenchable mobile (BE + rendu OK).
- **C4** : query param `locale` envoyé par FE → totalement ignoré BE + absent OpenAPI (inverse : FE émet, BE drop).
- **C7** : `aggregateNps`/`findByMuseum` BE → 0 caller (NPS data layer présent, jamais exposé).
- **C7** : champ `userName` envoyé par FE → jamais lu BE (ghost field, friction UX).
- **C8** : branding `config.branding` écrit par FE → 0 consommateur (write-to-void).
> **Implication** : la "plomberie" donne une fausse impression de complétude. Plusieurs features sont à 80% câblées avec le dernier maillon (trigger ou consumer) manquant. Décision systématique requise : **câbler le maillon OU enterrer le code mort (UFR-016)** — l'entre-deux est un mensonge de capacité (UFR-013).

### P-B — Tests/Maestro qui masquent ou ratent le happy-path (UFR-021)
- **C1** : test streaming mocke `onDone` manuellement → vert CI / rouge prod (exactement DOB-2026-05-17).
- **C4** : `DailyArtCard.test.tsx` mocke `<Image>` → ne peut PAS attraper une URL 400.
- **C10d** : `onboarding-flow.yaml` STALE actif dans `shards.json:20` → assert slides disparus = shard rouge OU faux-vert masqué.
- **C10a** : swipe-delete + reprise-par-tap non couverts Maestro (grandfathered baseline).
- **C10b** : intent chips / carnet / confirm-sheet non tap-through Maestro.
> **Implication** : la confiance CI est partiellement fausse. Les mocks couvrent l'interaction même qui casse. Maestro stale shippé = signal CI non fiable à auditer (run logs `shards.json`).

### P-C — Sync cross-device & local-only persistence
- **C10c** : 5 settings local-only (read serveur masque l'absence de write).
- **C10b** : daily-art toujours fetché `en`, locale runtime jamais threadé.
> Effet net : valeurs serveur = état à l'inscription (defaults), jamais les changements ultérieurs.

### P-D — Multi-tenant B2B = plomberie présente, non câblée (latent, B2C-only V1)
- **C8** : `getStats` scope no-op, museum_manager 7/8 links 403, branding sans consumer.
- **C7** : scope read admin non appliqué (`listAllReviews`/`listAllTickets` sans museumId), museum_manager 403 sur modération.
- **C6** : `artwork_knowledge` tenant-flat (dette de design assumée, public catalog).
- **C9** : B2B leads → email inbox, pas de CRM requêtable.
> Cohérent avec CLAUDE.md (zéro musée contracté, B2B = hypothèse future) — mais **latent** : la 1re mise en service B2B exposerait ces trous. À acter explicitement (ADR) ou enterrer.

### P-E — Commentaires / docs / contrats stale ou mensongers (UFR-013)
- **C1** : commentaires SSE stale dans `sendMessageStreaming.ts` (couche enterrée).
- **C6** : docstring `compare-result.types.ts:15` ment (score-floor non appliqué) ; `attribution` cc-by-sa référence état inatteignable.
- **C7** : commentaire export `admin-export.route.ts:154` « reviews+tickets lack museum_id » FAUX (ajouté #295).
- **C8** : branding "takes effect on next visitor session" = faux ; gotcha CLAUDE.md "apiPut n'existe pas" = STALE (existe `lib/api.ts:233`).
- **C5/C9** : OpenAPI `/leads/*` absent du contrat (endpoints publics hors contract-test).
- **C4** : query `locale` = contrat trompeur (envoyé, dropé, absent OpenAPI).

### P-F — RTL / a11y mineurs (non-bloquants)
- **C10a** : `borderTop/BottomRightRadius` physique non flaggé par sentinel `_rtl-style-audit.ts` (radius absents de PHYSICAL_KEYS — pattern sur 6+ fichiers).
- **C10c** : 2 lacunes a11y `Switch` (AiConsent `checked` manquant ; ContentPreferences `role`+`checked` manquants), EN 301 549 §9.1.3.1.

### P-G — Dead code / orphelins (UFR-016 burial candidates)
- **C10b** : `WelcomeCard` (3 boutons fixes) monté nulle part hors tests.
- **C10d** : `useTypewriter` orphelin (test-only).
- **C6** : slug `cc-by-sa` inatteignable + `fallbackVisualThreshold` config morte.
- **C7** : ghost `userName`, dead branch 409 `already_reviewed`.
- **C10g** : `isStale` return jamais consommé (cosmétique).

---

## 4. Priorisation E2E

### P0 — bloquants launch (fix in-session, ne pas documenter pour plus tard — feedback_track_not_treat_v1_blocker)
1. **C1 bulle-vide texte-seul** — le happy-path le plus courant ne rend rien. Fix garde L117 + test réel (stub `postMessage`, pas `sendMessageSmart`) + Maestro tap-through texte.
2. **C3 consent location bypass** — fuite GDPR de coords exactes. Nullifier/supprimer la branche raw-coords.
3. **C2 MFA verrou** — un user enrôlé se verrouille. Router `mfaRequired` → `MfaChallengeScreen` (créer route) + idem web admin.
4. **C4 daily-art images** — 47% de cartes sans visuel. Réparer/remplacer les 14 URLs + sentinel CI HEAD-200.
5. **C9 leads durabilité** — lead perdu si Brevo down. Table locale + queue/retry avant le call externe (pré-launch = capture critique).

### P1 — produit / honnêteté / latent B2B
6. **C7 NPS** — câbler `aggregateNps` + composant 0-10, OU enterrer + acter descopage (KR2). NPS mobile actuellement structurellement impossible.
7. **C10c preferences sync** — câbler `/me/preferences` OU enterrer le schema BE. Trancher l'intention produit.
8. **C8 museum_manager** — latent (B2C-only) : bloquer `museum_manager` de `/stats` (501/empty) + retirer du FE shell jusqu'à pages tenant-scopées, OU acter ADR.
9. **C10d Maestro stale** — supprimer/réécrire `onboarding-flow.yaml` (faux signal CI). Vérifier run logs shard.
10. **C5 quota_exceeded consent** — décision ADR (cookieless exempté) OU gate BE.
11. **C6 useCompareImage** — câbler le trigger capture-photo OU enterrer + `// e2e-skip:` (feature compare invisible mobile sinon).

### P2 — cosmétique / dette
- C10b `onChooseAnother`, daily-art locale `en`.
- C10a swipe-delete UX (réapparition), Maestro swipe/resume.
- a11y Switch (C10c), RTL radius (C10a).
- Burial dead code (P-G) : WelcomeCard, useTypewriter, cc-by-sa, ghost userName, dead 409, isStale, fallbackVisualThreshold.
- Commentaires stale (P-E) : SSE, export, branding copy, score-floor docstring.
- OpenAPI `/leads/*` + `daily-art locale` au contrat.

---

## 5. Note de méthode (honnêteté UFR-013)

- Toutes les ruptures P0/P1 ci-dessus sont **confirmées par leur feuille respective avec `path:line`** — agrégation, pas re-vérif.
- C5-§ relève une auto-correction honnête de sa propre feuille (`emitQuotaExceeded` IP+UA finalement présents — point initialement listé comme rupture, infirmé à la relecture par l'auditeur C5). **Le pattern "endpoints BE sans call-site FE — quota_exceeded sans UA/IP" cité dans le brief est donc INVALIDE pour ce sous-point** : C5 vérifie que `middleware.ts:111-112` passe bien `userAgent` + `clientIp`. Conservé ici pour traçabilité.
- Décalage de HEAD pass-1 (`89852f2a1`) vs pass-2 (`1fb32f5ba`) : aucune contradiction de findings, mais les line-numbers C1-C9 sont à valider si re-touchés post-`1fb32f5ba`.
