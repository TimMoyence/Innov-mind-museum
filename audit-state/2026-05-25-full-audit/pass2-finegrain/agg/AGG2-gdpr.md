# AGG2 — Synthèse domaine GDPR (B1–B19) — pass2 fine-grain

> **Agrégation READ-ONLY** (UFR-022 / UFR-013). Consolide les feuilles pass-2 : `leaf/L07-B1-B4.md`, `L08-B5-B8.md`, `L09-B9-B12.md`, `L10-B13-B16.md`, `L30-B17-B19.md`. Cross-référence pass-1 : `phase-a-roadmap/A3-gdpr.md`, `phase-b-diffs/B5-gdpr-correctness.md`, `B5-gdpr-enforcement.md`, `phase-c-e2e/C3-museum.md`.
> Branche `dev`. Feuilles pass-2 @ HEAD `1fb32f5ba` ; pass-1 @ HEAD `89852f2a1` (delta de commits non re-vérifié ici — agrégation pure, pas de re-dérivation code).
> Roadmap source des marqueurs : `docs/ROADMAP_PRODUCT.md:107-125`.

---

## 1. Tableau consolidé B1–B19

| Item | Sujet | Marqueur roadmap | Verdict pass-2 consolidé | Sévérité résiduelle |
|---|---|---|---|---|
| **B1** | TTS audio orphans cleanup on delete (Art.17) | ✅ | ✅ DONE (vérifié bout-en-bout, ordering refs-avant-cascade correct) | — |
| **B2** | Brevo unsubscribe on delete (Art.17 + e-Privacy) | ✅ | ✅ DONE (removeContact idempotent, leak-safe, best-effort avant cascade) | — (UX one-click in-app = NEXT séparé, non backed) |
| **B3** | DSAR export completeness (Art.15/20) | ✅ | ⚠️ MOSTLY DONE — **gap `artwork_matches` non exporté** | LOW-MODERATE |
| **B4** | S3 prefix-scan erasure (Art.17) | ✅ | ✅ DONE (scan `chat-images/` + filtre boundary-safe `/user-<id>/`, legacy fetcher forwardé) | — |
| **B5** | `runS3OrphanPurge` wiré cron | ✅ | ✅ CONFIRMÉ (wiring réel `index.ts:481-485` via registrar BullMQ) | — (path:line roadmap stale) |
| **B6** | BE consent enforced at LLM call site | ✅ | ✅ enforcement réel ; ⚠️ **doc-claim `AppError CONSENT_REQUIRED` FAUX** + **2 scopes `profile` décoratifs** | LOW (honnêteté + scope mort) |
| **B7** | Audio consent sur POST /sessions/:id/audio | ✅ | ⚠️ audio upload (STT) ✅ ; **TTS sortant ❌ NON consent-gated** | **P1 (gap réel)** |
| **B8** | Consent inheritance FE namespacé userId + clear logout | ✅ | ✅ CONFIRMÉ (namespace par userId, clear ordering avant token wipe correct) | — |
| **B9** | `location_to_llm` consent | ✅ | ⚠️ FE ✅ + BE resolved-path ✅ ; **BE raw-coords bypass OUVERT** | **P0 (GDPR)** |
| **B10** | iOS Info.plist `NSLocationAlways*` retiré | ✅ | ✅ CONFIRMÉ (WhenInUse only, pas de background location) | — (copie plist "never shared" en tension avec B9) |
| **B11** | EXIF strip optional fallthrough + boot-assert | ⚠️ | ⚠️ CONFIRMÉ silencieux, **boot-assert ABSENT** (prod OK 3 sites wirés) | P2 (defense-in-depth) |
| **B12** | PGP key placeholder + CI gate | ❌🧑‍🔧 | ❌ placeholder shippé + **AUCUN CI gate** | **P0 (ops + code)** |
| **B13** | `security@musaium.com` mailbox + smoke RFC 9116 | ❌🧑‍🔧 | PARTIEL — security.txt OK, provisioning mailbox non-prouvable-par-code | P0-launch (ops-humain) |
| **B14** | Langfuse DPA + SUBPROCESSORS.md | ❌🧑‍🔧 | ❌ NON FAIT + **incohérence élargie** (absent Art.28 SUBPROCESSORS **ET** Art.30 ROPA, présent public) | **P0 (ops + dev)** |
| **B15** | Subprocessors centralisés + `/subprocessors` public | ✅ DONE-DEV | ✅ CONFIRMÉ (19 vendors canonical EN+FR, route + drift sentinel) | — (source-of-truth = BE, copie web) |
| **B16** | Privacy policy version sync + âge 15 | ✅ DONE-DEV | ✅ CONFIRMÉ (âge 15 CNIL 2021-018, 3-way sync 1.0.0/2026-05-21, 0 drift) | — |
| **B17** | ANTHROPIC_API_KEY dead config + rotation | ⚠️ | ⚠️ code/.env.example cleanup DONE ✅ ; **clé live `sk-ant-…` présente `.env:108`** | P0-launch (ops révocation) |
| **B18** | /terms route museum-web | ✅ DONE-DEV | ✅ DONE complet (page réelle + canonical + hreflang + Footer + test) | — |
| **B19** | S3 bucket Public-Access-Block IaC | ❌🧑‍🔧 | ❌ ABSENT (zéro Terraform, zéro sentinel `GetPublicAccessBlock`) | **P0 (ops/IaC + code)** |

**Comptage** : DONE = 9 (B1,B2,B4,B5,B8,B10,B15,B16,B18) · PARTIAL/⚠️ avec gap = 4 (B3,B6,B7,B11) · OUVERT ❌🧑‍🔧 = 6 (B9*,B12,B13,B14,B17,B19).
(*B9 marqué ✅ roadmap mais verdict ⚠️/❌ sur le sous-chemin BE — voir corrections marqueur §3.)

---

## 2. NOUVEAUX findings vs pass-1

Findings pass-2 qui **n'étaient PAS dans A3-gdpr pass-1** (ou qui le précisent matériellement) :

### 2.1 — B3 DSAR : `artwork_matches` rows ABSENTES de l'export Art.15 (NOUVEAU)
Pass-1 (A3) a déclaré B3 ✅ DONE et énuméré les 8 catégories ajoutées comme complètes. **Pass-2 (L07) découvre** que `artwork_matches` (`artworkMatch.entity.ts`, OneToMany per-message — `chatMessage.entity.ts:80-84`) — i.e. **à quelles œuvres les photos uploadées par l'user ont été AI-matchées** (artworkId/title/artist/confidence/source/room) — est persisté en **table séparée**, PAS dans `message.metadata` (`chat.repository.typeorm.ts:170-182`). La projection DSAR exporte `metadata` mais PAS la relation `artworkMatches` → données dérivées rattachées au sujet **absentes de l'export Art.15**. Severité LOW-MODERATE (borderline "personal data" mais défensiblement in-scope). Non listé dans la remédiation roadmap B3. **L'énumération roadmap elle-même était incomplète.**

### 2.2 — B7 TTS sortant NON consent-gated (NOUVEAU vs A3, déjà flag B5-correctness)
Pass-1 A3 a déclaré B7 ✅ DONE sans re-vérif indépendante (confiance D3). **Pass-2 (L08) re-dérive** : `POST /messages/:messageId/tts` (`chat-media.route.ts:271-279` → `createTtsHandler`) envoie le texte assistant à OpenAI TTS (`text-to-speech.openai.ts:33`) **sans `consentChecker` ni `isGranted`**. Asymétrie : refuser le consent audio bloque le STT entrant mais PAS la synthèse vocale sortante, même scope logique `third_party_ai_audio_openai`. (B5-gdpr-correctness l'avait noté MEDIUM ; B5-enforcement aussi. A3 ne l'a pas capté.) → **gap réel.**

### 2.3 — B9 raw-coords bypass : confirmé full-precision GPS leak (PRÉCISÉ — voir §3)
Pass-1 A3 a déclaré B9 ✅ DONE (FE scope présent). **Pass-2 (L09) + C3 pass-1** établissent que le gate ne nullifie que `resolvedLocation` ; le **raw `context.location` (`lat:X,lng:Y` full-precision)** est propagé sur un canal séparé NON gardé (`prepare-message.pipeline.ts:481-484`) et émis par le fallback `buildVisitorContextLine` (`llm-prompt-builder.ts:194-201`) **quand le consent est refusé**. Résultat strictement PIRE que le coarse city/country du chemin gardé. **Le test de régression `no-museum-geolocated.test.ts:67-82` ne couvre jamais ce side-channel** (les 3 cas omettent `context.location`). C3 pass-1 l'avait flag RUPTURE #1 HAUTE ; A3 pass-1 ne l'a PAS vu (a déclaré ✅).

### 2.4 — B6 : doc-claim `AppError CONSENT_REQUIRED` FAUX (NOUVEAU — honnêteté UFR-013)
`consent-gate.ts:23,88` + `consent-checker.ts:15-16` affirment que le refus est wrappé en `AppError({code:'CONSENT_REQUIRED', scope})` HTTP. **Pass-2 (L08) prouve FAUX** (`grep CONSENT_REQUIRED` = 0 hit dans `chat.service.ts`) : le vrai chemin est une **refusal-bubble** (`prep.result`, message assistant localisé `id:consent_refusal::<scope>`, statut 201) — PAS un 403. Le 403 `CONSENT_REQUIRED` n'existe QUE sur la route audio (B7). Commentaires stale = design abandonné. Enforcement OK, doc trompeuse.

### 2.5 — 2 scopes `profile` décoratifs (CONFIRMÉ — pass-1 B5 l'avait, A3 partiellement)
`third_party_ai_profile_openai` / `_google` collectés + audités (`consent-audit-mapping.ts:14,30`) mais **JAMAIS enforced** : aucun call-site `isGranted(..., 'third_party_ai_profile_*')`, pas de canal `profile` dans `provider-resolver.DispatchChannel`. B5-correctness note que `userMemoryBlock` (profil du sujet) est injecté au LLM (`prepare-message.pipeline.ts:420,458`) SANS gate profile → consentement décoratif = conformité-théâtre / risque transparence Art.7. (B5-enforcement compte aussi `audio_google` décoratif — hard-pin audio→openai.)

### 2.6 — B14 Langfuse : incohérence ÉLARGIE — absent ROPA Art.30 aussi (NOUVEAU vs A3)
Pass-1 A3 a noté Langfuse absent de `SUBPROCESSORS.md` (Art.28). **Pass-2 (L10) élargit** : Langfuse est aussi absent de `docs/legal/ROPA.md` (Art.30, `grep` = 0) ET `docs/legal/dpa-signed/` MISSING — alors qu'il est listé dans les **3 surfaces privacy PUBLIQUES** (canonical:242/529, FE content). **Inversion atypique** : le public est plus complet que l'interne contraignant (Art.28/30). Bonus pass-2 : **CARTO + Expo** souffrent du même gap interne (présents public, absents SUBPROCESSORS.md) → le ledger "20 vendors" manque ≥3 vendors. Sub-doute : jurisdiction `Germany/internal` du canonical non-prouvée (dépend tier EU vs US de l'org Langfuse Cloud `cloud.langfuse.com`).

### 2.7 — B12/B19 : défenses CI/IaC INEXISTANTES confirmées en code (PRÉCISÉ)
Pass-2 (L09 + L30) confirment par grep exhaustif : **aucun CI gate** sur le token `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` (réclamé par CLAUDE.md mais absent des workflows) ; **aucun Terraform** (`*.tf` = 0) ni sentinel boot-check `GetPublicAccessBlock` pour le S3 PAB. Les deux défenses sont documentées/réclamées en doctrine mais UNENFORCED.

### 2.8 — B17 : clé Anthropic live confirmée dans `.env:108` (PRÉCISÉ)
Pass-2 (L30) confirme `ANTHROPIC_API_KEY=sk-ant-api03-<REDACTED>…` réelle dans le working-tree `.env` (NON committée — gitignored, pas de fuite repo). Code cleanup DONE (dead config retirée, `e0aade002`/`7c671f8da` #293). Bonus L30 : `.env` contient aussi OPENAI/GOOGLE/DEEPSEEK live (secrets prod légitimes) → tout `.env` exposé = rotation de tout le set. Clé Anthropic = morte (aucun usage code) → **révoquer par sécurité**.

---

## 3. CORRECTIONS marqueur roadmap

| Item | Marqueur actuel | Correction recommandée | Justification |
|---|---|---|---|
| **B9** | ✅ | **✅ → ⚠️ (ou ❌ sur le sous-chemin BE)** | FE done + resolved-path gate done, mais **raw-coords full-precision bypass OUVERT** : un user refusant `location_to_llm` voit quand même ses GPS exacts partir au LLM (`llm-prompt-builder.ts:197-200` fallback). Le ✅ surévalue — l'enforcement BE est incomplet. Confirmé indépendamment par L09 + C3 (RUPTURE #1 HAUTE). **Reformuler** : "FE ✅ ; BE resolved-path ✅ ; raw side-channel à fermer (P0)". |
| **B11** | ⚠️ | **⚠️ CONFIRMÉ correct** (pas un re-flip) | Le downgrade ✅→⚠️ du 2026-05-25 est exact. Pass-2 (L09) AGRÉE : EXIF strip wiré 3 sites (prod OK, risque réel faible) mais boot-assert/log/metric demandé ABSENT, le commentaire "intentionally observable" est FAUX (zéro signal). Garder ⚠️. |
| **B3** | ✅ | **✅ → ⚠️** (mineur) | DSAR matériellement complet SAUF `artwork_matches` (NOUVEAU §2.1). Soit exporter, soit documenter exclusion explicite. Sévérité LOW-MODERATE → ⚠️ ou note "exclusion documentée". |
| **B6** | ✅ | ✅ enforcement OK — **corriger le TEXTE** "8 scopes enforced" → "text+image du provider actif gated ; audio via route ; profile non-enforced" + fixer doc `AppError CONSENT_REQUIRED` (FAUX §2.4). | Honnêteté UFR-013 : le marqueur ✅ est juste sur l'enforcement, mais la prose roadmap + commentaires code mentent sur le mécanisme et le compte de scopes. |
| **B7** | ✅ | **✅ → ⚠️** | Audio upload (STT) gated ✅ mais TTS sortant ❌ (NOUVEAU §2.2). Claim "audio consent enforced" partiel. |
| **B14** | ❌🧑‍🔧 | ❌🧑‍🔧 **correct** — mais préciser : part DEV sous-estimée (ajout row SUBPROCESSORS.md **+ ROPA.md** = faisable en repo sans Tim) + gap élargi à CARTO/Expo. | Le marqueur est honnête ; l'énoncé sous-estime ce qui est réalisable côté dev immédiatement. |
| **B12/B13/B15/B16/B17/B18/B19/B5/B10/B8/B1/B2/B4** | (resp.) | **marqueurs corrects** | Tous re-confirmés exacts par pass-2 (DONE confirmés OU ❌🧑‍🔧 honnêtes). Seul B5 : note L69 `index.ts:467` stale (réel `:481-485`) — cosmétique path:line. |

**Net** : 3 flips recommandés (B9 ✅→⚠️/❌, B3 ✅→⚠️, B7 ✅→⚠️) + B11 ⚠️ confirmé (pas de re-flip) + 2 corrections de TEXTE (B6 prose + commentaires, B5 path:line).

---

## 4. Debt GDPR priorisée

### P0 — GDPR launch-blockers

| ID | Item | Action | Owner |
|---|---|---|---|
| **DEBT-B9-RAW-LOC** | B9 | Gater le canal raw `context.location` sur `location_to_llm` : (a) ne pas propager `context.location` dans `buildOrchestratorInput` quand consent refusé, OU (b) **supprimer le fallback raw** `buildVisitorContextLine:197-200` (coords exactes au LLM = zéro valeur GDPR, coarse-only = contrat documenté). + RED test : consent refusé + `context.location` peuplé → assert PAS de `lat:`/`lng:`/`visitor_context`. | DEV (in-session) |
| **DEBT-B12-PGP-CIGATE** | B12 | CI step (ci-cd-web.yml quality) qui grep `pgp-key.txt` pour `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` → FAIL build. Réclamé par CLAUDE.md, absent. | DEV |
| **DEBT-B12-PGP-OPS** | B12 | Générer clé Ed25519 réelle (`docs/operations/PGP_KEY_GENERATION.md`) OU retirer la ligne `Encryption:` de `security.txt`. | OPS (Tim) |
| **DEBT-B14-LEDGER** | B14 | Ajouter row Langfuse à `SUBPROCESSORS.md` (Art.28) **ET** `ROPA.md` (Art.30) ; idem CARTO + Expo. Créer `docs/legal/dpa-signed/`. (Part DEV faisable en repo.) | DEV |
| **DEBT-B19-S3PAB** | B19 | Sentinel boot-check (ou CI) appelant `GetPublicAccessBlock` sur `$S3_BUCKET`, fail si pas `BlockPublicAcls && IgnorePublicAcls && BlockPublicPolicy && RestrictPublicBuckets`. (Recommandé V1 vs Terraform from-scratch.) S3 stocke voix HIGH + images EXIF/GPS. | DEV ou OPS |

### P1 — GDPR correctness (non strict launch-blocker mais à shipper V1)

| ID | Item | Action |
|---|---|---|
| **GDPR-B7-TTS** | B7 | Gater `createTtsHandler`/`synthesizeSpeech` sur `third_party_ai_audio_openai` (miroir `createAudioHandler:66-71` + 403 `consent_required`), OU ADR explicite "TTS de texte généré exempt" + test. One-handler fix. |
| **GDPR-B6-PROFILE** | B6 | Trancher `third_party_ai_profile_*` (2 scopes décoratifs) : enforcer avant injection `userMemoryBlock` (`prepare-message.pipeline.ts:420,458`) OU retirer du set FE/audit (consentement promis mais inopérant = risque Art.7). |
| **DEBT-B3-ARTWORK-MATCHES** | B3 | Ajouter `artworkMatches` à l'export DSAR (port + projection message-level) OU documenter exclusion explicite. |

### P2 / defense-in-depth

| ID | Item | Action |
|---|---|---|
| **DEBT-B11-EXIF-ASSERT** | B11 | Boot-assert dans `chat-module.build()` (`if (!imageProcessor) throw` quand EXIF strip requis) OU `logger.error`/metric `exif_strip_skipped` dans le fallthrough `stripExif:162-165` (rendre la branche réellement observable comme le commentaire le prétend). ~15-30 min. |

### Honnêteté / doc (UFR-013, non launch-blocker mais à corriger)

| ID | Action |
|---|---|
| **DOC-B6-A** | Réécrire commentaires `consent-gate.ts:21-31,84-90` + `consent-checker.ts:14-17` : surfacing = refusal-bubble `prep.result`, PAS `AppError CONSENT_REQUIRED`. + corriger prose roadmap "8 scopes enforced". |
| **DOC-B5** | Roadmap note L69 `index.ts:467` stale → `index.ts:481-485`. |
| **DOC-B10-COPY** | Copie plist `NSLocationWhenInUse` "never tracked or shared with third parties" en tension avec B9 (location IS partagée au LLM si consent grant) → flag legal/UX. |
| **DOC-deleteAccount** | (B5-correctness #3/#5) docstring `deleteAccount.useCase.ts:38-40` sous-énumère le cascade (omet reviews/support/user_memories, pourtant erased+exported) ; comment `user.entity.ts:135-137` "soft-delete deferred V1.1" stale (now hard-delete). |

### Ops-humain pur (hors-repo, blocking-launch)

| ID | Action | Effort |
|---|---|---|
| **OPS-B13** | Provisionner alias OVH→Gmail `security@musaium.com` + smoke RFC 9116 (mail test). | ~30 min Tim |
| **OPS-B14-DPA** | Signer DPA Langfuse + confirmer région Cloud (EU `cloud.langfuse.com` vs US → valide/invalide `transferMechanism:"internal"`). | Ops |
| **OPS-B17** | Révoquer `sk-ant-api03-<REDACTED>…` sur dashboard Anthropic (clé morte, présence inexpliquée). | ~5 min |

---

## 5. Note transverse

**Tension copy-vs-comportement (B9 ↔ B10)** : l'usage-string iOS plist (`Info.plist:69`) promet "location never tracked or shared with third parties" alors que B9 partage la location au LLM tiers (coarse si consent grant ; **raw full-precision si bypass actif**). À réconcilier (legal/UX) une fois DEBT-B9-RAW-LOC fermé.

**Pattern récurrent GDPR ce cycle** : enforcement matériel solide sur les chemins *résolus/explicites* (B6 gate, B4 erasure, B8 namespace) mais **side-channels / chemins parallèles non gardés** (B9 raw-coords, B7 TTS, B6 profile→userMemory) — la fuite passe "par le bas" du gate principal. Recommandation systémique : tout champ user-controlled atteignant un tiers (LLM/TTS) doit traverser le MÊME gate consent, pas un canal frère.
