# 📋 Rapport d'audit PASS-2 (fine-grain) — Musaium V1, 2026-05-25

> **Pourquoi un pass-2 ?** La pass-1 (35 agents) avait sous-livré l'échelle « maximale » choisie : 9 agents-section pour ~98 items roadmap (facteur 10), 2 clusters en angle unique, 7 features bundlées. Sur correction de l'utilisateur, ce pass-2 re-vérifie **tout, from scratch, à fine granularité, en arbre** : ~40 agents-feuilles (1 par 2-3 items, ignorant tout verdict antérieur) + 8 agents-agrégateurs par domaine + cette méta-synthèse.
> **La leçon, prouvée par les données** : re-passer même ce qui a été audité il y a quelques heures **n'est pas redondant** — le pass-2 a corrigé des erreurs de la pass-1 et trouvé ~15 findings supplémentaires. « Vérifié récemment » n'est jamais une raison de sauter.

---

## 0. Ce que le pass-2 a corrigé DANS la pass-1 (le point le plus important)

La pass-1 avait coché certains items ✅ trop vite. La re-dérivation indépendante a trouvé :

| Item | Tick pass-1 | Réalité pass-2 | Preuve |
|---|---|---|---|
| **I-CMP3** | ✅ | ⚠️ — bulle UTILISATEUR masque encore son texte ; live region non-conditionnelle | `ChatMessageBubble.tsx:237-238`, `StreamingBody.tsx:54` |
| **I-CMP4** | ✅ (caveat) | ❌ — 2.15:1 reproductible, le caveat "non reproductible" était faux | `tokens.semantic.ts:128-137` |
| **I-CMP5** | ✅ | ⚠️ — 4 refs `.app` vivantes, jamais touchées par #298 | `accessibility-content.ts:32,58,90,116` |
| **C1** | ✅ | ⚠️ — code OK mais provisioning 503 non fait | `fetch-models.sh` + CI grep=0 |
| **C7** | ✅ | ⚠️ — read+update unscoped, NPS dead-code | `ListAllReviews/Tickets`, `aggregateNps` |
| **B7** | ✅ | ⚠️ — TTS sortant non consent-gated | `chat-media.route.ts:271` |
| **B9** | ✅ | ⚠️/❌ — bypass raw-coords (GDPR) | `prepare-message.pipeline.ts:482` |

**C'est la démonstration empirique de ta thèse** : un seul passage (même fin) laisse des angles morts ; la cross-validation indépendante les ferme.

---

## 1. Findings NOUVEAUX du pass-2 (au-delà des 6 P0 de la pass-1)

### Sécurité (AGG1)
- **Logger sans scrub** (`error.middleware.ts:99,117`) — `req.originalUrl` brut (code/token/email) en stdout. Le sink Sentry est scellé, le sink logger est ouvert. P1.
- **Langfuse PII vision** — `stripFreeText` ne masque que `content` *string*, pas le tableau multimodal `[{type:text},{type:image_url}]` → free-text user fuit vers cloud.langfuse.com si `LANGFUSE_ENABLED=true`. Le test PII-seed ne teste que string. P1.
- **Cost-breaker** — recovery HALF_OPEN `reset()` zéroe `dailySpend` → cap $/jour érodé par trips horaires. Triple-confirmé, le test entérine. P1.
- **TOTP TOCTOU** — `markUsed` non-atomique. **I-SEC12** — pins OK mais `node_modules` local stale (TD-11).

### GDPR (AGG2) — pattern « side-channels parallèles non gardés »
- **B9 raw-coords** (P0) : refuser le consent envoie des coords *plus* précises (le gate ne couvre que le canal résolu).
- **B7 TTS** : texte assistant → OpenAI TTS sans consent.
- **B3 DSAR `artwork_matches`** : œuvres matchées par les photos du user absentes de l'export Art.15.
- **2 scopes décoratifs** (`profile_openai/_google`) jamais enforced ; commentaire `CONSENT_REQUIRED` faux (vrai chemin = bulle de refus 201).
- **B14** : Langfuse/CARTO/Expo absents de SUBPROCESSORS.md **et** ROPA.md (la part dev est faisable en repo, pas 100 % ops). **B17** : clé `sk-ant-…` réelle encore dans `.env:108` (gitignored, à révoquer).

### Feature-gates (AGG3)
- **C1 503** : GCS non provisionné + SHA jamais injecté CI + pas de fallback. **C2 CC-BY-SA** inatteignable (slug `cc-by-sa-4.0`≠`cc-by-sa` + DB CHECK 2-valeurs) + fixture masque encore. **C4** : `seed-pilot-museums.sh` existe ET ingère Louvre/Orsay/Pompidou (Q-codes Paris pas retirés → dead-code à enterrer). **C5** : `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` absent des env → funnel KR4 no-op silencieux. **C8** : page analytics → 400 (strictObject rejette museumId). **I-FIX3** corrigé sur **#300 non-mergé**.

### Stabilité (AGG4)
- **`LOT-P0-STABILITY-CLOSURE.md` = claim creux** : 4 commits orphelins, `git branch --contains`=NONE, LOT 4 jamais mergé. **I-OPS2** (alertes inexistantes) + **I-FIX3** (cap anon-bypass) = seuls vrais blockers stabilité V1. **Compte smoke seedé en PROD** chaque deploy, jamais supprimé.

### E2E (AGG7) — patterns transverses
- **P-A endpoints BE sans call-site FE** (motif dominant) : `PATCH /me/preferences` (5 réglages local-only), `useCompareImage`, `aggregateNps`, `reviews.userName`, branding consumer. **Fausse complétude** : la plomberie existe, le câblage manque.
- **P-B tests/Maestro masquent le happy-path** : bulle-vide (mock `onDone`), daily-art (mock `<Image>`), 2 Maestro stale actifs sur shards CI.

---

## 2. Santé E2E consolidée (AGG7)

| Feature | /10 | Rupture principale |
|---|---|---|
| Chat | 4 | bulle assistant vide texte-seul (P0) |
| Auth | 7.5 | MFA mobile verrou |
| Museum | 6 | consent location bypass (GDPR) |
| Daily-art | 5 | 14/30 images cassées |
| Paywall | 8 | quota_exceeded hors consent (mitigé) |
| Knowledge/compare | 6 | useCompareImage orphan + pgvector non gaté |
| Review/NPS | 5 | NPS dead-code + StarRating cap 5 |
| Admin | 6 | museum_manager cassé (leak + 7/8 403) |
| Leads | 6.5 | Brevo SPOF non durable |
| Conversation | 8.5 | swipe-delete session pleine réapparaît |
| Home | 8 | onChooseAnother non câblé |
| Settings | 6.5 | 5 prefs local-only (sync cassé) |
| Onboarding | 7 | Maestro stale en CI |
| Legal / Diagnostics / Art-keywords | 9 / 9 / 9 | propres, WIRED |

## 3. Qualité des diffs (AGG8) — moyenne 8.0/10

Ingénierie solide, honnêteté commit↔code remarquable. **Faiblesse systémique** : le test adversarial s'arrête une étape trop tôt (B3/B4/B6/B9 verts sur comportement cassé). La cross-validation 2-angles a converti 2 reviews APPROVED (B3 a11y 9/10, B6 data 8.5/10) en findings bloquants — **non-redondante, prouvée**.

---

## 4. Priorisation finale consolidée (J-13 → launch)

**P0 launch (fix in-session) :** ① chat bulle-vide texte-seul · ② MFA mobile verrou · ③ B9 consent location bypass · ④ I-OPS2 alertes backend/DB/Redis + I-FIX3 cap anon (merger #300) · ⑤ daily-art images + sentinel CI · ⑥ C1 provisioning SigLIP (503).

**P0.5 (décision produit) :** KR2 NPS (câbler 0-10 + per-museum OU descoper) · museum_manager (aligner OU retirer le rôle V1) · B12 PGP CI-gate · B14 ledger subprocessors (part dev) · B19 S3 PAB sentinel.

**P1 :** logger scrub · Langfuse PII array · cost-breaker dailySpend · TTS consent · `PATCH /me/preferences` câblage · DSAR artwork_matches · TOTP TOCTOU · leads durabilité · smoke account teardown · CC-BY-SA · 2 Maestro stale · I-CMP3/4/5 a11y résiduels.

**Honnêteté (à nettoyer) :** retirer/merger `LOT-P0-STABILITY-CLOSURE.md` · réécrire I-SEC4/I-SEC6 (faux-claims) · réconcilier I-SEC8 (LOW, pas critique) · corriger anchors c4b/c2 + `doc-anchor-check.mjs` · ADR-038/065 `llm:v1`→`v2`.

**Ops Tim :** B12 PGP réelle · B13 mailbox security@ · B14 signer DPA · B17 révoquer clé Anthropic · B19 S3 PAB · C7.5 device TTS.

---

## 5. Inventaire des artefacts
- Pass-1 : `phase-a-roadmap/A1-A9.md`, `phase-b-diffs/B1-B9*.md`, `phase-c-e2e/C1-C10.md`, `REPORT.md`.
- Pass-2 : `pass2-finegrain/leaf/L01-L30 + B8b/B9b + C10a-g.md` (~36 feuilles), `pass2-finegrain/agg/AGG1-8.md` (8 syntheses domaine), ce `REPORT-PASS2.md`.
- Chaque finding = verdict + `path:line` + confiance. ~70 agents fresh-context au total sur les 2 passes.
