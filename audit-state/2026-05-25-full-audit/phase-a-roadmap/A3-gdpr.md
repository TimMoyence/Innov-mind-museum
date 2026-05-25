# A3 — Audit P0.B GDPR + Anonymisation (B1..B19)

> Fresh-context READ-ONLY (UFR-022 / UFR-013 / UFR-024). Ref vérifiée : `dev` @ HEAD `89852f2a1`.
> Aucun code/doc modifié. Toutes preuves lues via Read/Grep. "Vérifié" ≠ "attendu".
> Cross-input : `docs/ROADMAP_PRODUCT.md` lignes 88-110 + `audit-state/2026-05-25-roadmap-reconstruction/findings/D3-lot2-gdpr.md`.
> Note : D3 a vérifié B6/B7/B10/B15/B16/B18 (DONE-DEV) + I-SEC8/9/I-CMP2 ; ce rapport vérifie indépendamment B1-B5, B8, B9, B11, B12-B14, B17, B19 et re-confirme spot-check des items D3.

---

### P0.B1 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : TTS audio erasure implémentée bout-en-bout. `chat-repository-audio.ts:62-79` `findAudioRefsByUserId` (select `message.audioUrl` join session.userId, dedup) ; port `audio-cleanup.port.ts:14-20` `AudioCleanupPort.deleteUserAudio` ; proxy lazy `auth/useCase/index.ts:166-183` (résout refs DB → `audioStorage.deleteByRef(ref)` per-ref try/catch) ; injecté `deleteAccountUseCase` `auth/useCase/index.ts:201-207` (5e arg) ; appelé `deleteAccount.useCase.ts:95-104` AVANT le cascade DB. Confirme le claim audit ("keys sans user prefix" → résolution DB-sourced).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant notable.

### P0.B2 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `brevo-beta-signup.notifier.ts:75-82` `removeContact(email)` → `DELETE /v3/contacts/{email}?identifierType=email_id` (endpoint `:11`) ; port `MarketingContactRemovalPort` `audio-cleanup.port.ts:29-30` ; proxy `auth/useCase/index.ts:190-199` (Brevo si `env.brevoApiKey`, sinon Noop notifier `:127`) ; injecté `deleteAccountUseCase` `:206` ; appelé `deleteAccount.useCase.ts:108-117` best-effort avant cascade (email encore résolvable). Confirme le claim audit ("seul subscribe() existait").
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : claim FE "One-click unsubscribe" (`en.json:334`) désormais backed côté delete-account ; je n'ai PAS vérifié un flux unsubscribe UI dédié hors suppression de compte.

### P0.B3 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `exportUserData.useCase.ts:66-139` (`schemaVersion:'2'`) assemble TOUTES les catégories listées manquantes par l'audit : `userMemory` (mapUserMemory `:143-160` couvre favoriteArtists/museumsVisited/notableArtworks/summary etc.), `auditLogs` (`mapAuditLog` `:163-174`, exclut prevHash/rowHash), `messageFeedback` (`:176-182`), `messageReports` (`:185-193`, exclut reviewer fields), `socialAccounts` (`:195-202`), `apiKeys` (`mapApiKey` `:205-216`, exclut hash/salt). Colonnes User+ChatSession : user object `:105-127` (dateOfBirth/museumId/tier/...) ; session fields `chat-repository-queries.ts:116-119` (`coordinates`/`visitContext`/`currentRoom`/`currentArtworkId` tous présents). Allow-listing explicite per-field (pas de spread) = sécurité R14.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : `savedArtworks:[]` vide by-design (mobile-local, jamais persisté server-side) — documenté `:130` ; à garder en tête si V2 persiste les favoris.

### P0.B4 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : Bug prefix-mismatch corrigé. `image-storage.s3.ts:116-160` `deleteByPrefix` scanne désormais TOUT le prefix `chat-images/` (`scanPrefix` `:129-133`) puis filtre `key.includes('/user-<id>/')` boundary-safe (`:124,141`) — plus de scan `chat-images/user-<id>/` qui matchait zéro objet prod. Le `legacyFetcher` 3e arg est forwardé proprement : proxy `auth/useCase/index.ts:140-147` passe BOTH args (commentaire B4/R8 `:143-144` "dropping legacyFetcher silently disabled the DB cleanup") ; `legacyImageRefLookupProxy` `:154-159` wiré. Confirme résolution des 2 sous-bugs.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B5 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `runS3OrphanPurge` désormais wiré via cron. `src/index.ts:25-27` importe `registerS3OrphanPurgeCron` depuis `s3-orphan-purge-cron.registrar` ; démarré `:481-483` (`startRedisCron(registerS3OrphanPurgeCron, env.s3OrphanPurgeRetentionDays)`) ; teardown `:286-287`. Config `env.ts:288` (`S3_ORPHAN_PURGE_RETENTION_DAYS` default 180) + type `env.types.ts:308`. Le job `s3-orphan-purge.job.ts:193` a maintenant des callers réels (claim audit "0 callers" résolu).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B6 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 (`prepare-message.pipeline.ts:268-269` runConsentGate → checkThirdPartyAiConsent AVANT persist ; `consent-gate.ts:62-80` exige scopes du provider actif text+image ; `third-party-ai-consent-checker.ts:40-52` fail-CLOSED sur anon ; wiring `chat-module.ts:695,723,834`). Spot-check de mon côté : `third-party-ai-consent-checker.ts` présent + référencé dans le pipeline. Sémantique = scopes du provider ACTIF (pas 8 en aveugle), correct.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : texte roadmap "8 scopes NOT enforced" périmé (déjà noté dans D3) — à reformuler "text+image gated pipeline, audio à la route".

### P0.B7 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 (`chat-media.route.ts:61-71` résout `resolveActiveProviderForScope('audio')` + `consentChecker.isGranted` → 403 `consent_required` AVANT STT ; checker injecté `:224`). Non re-vérifié indépendamment ligne-à-ligne ; D3 confiance haute, cohérent avec B6 (même infra `ThirdPartyAiConsentChecker`).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B8 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : Bug d'héritage de consent cross-user corrigé. `consentStorageService.ts:29-38` `consentMemoKey()` namespace par userId (`musaium.consent.aiAccepted.<userId|__anon>`, dérivé du token via `extractUserIdFromToken`) — plus de clé globale `consent.ai_accepted` (le legacy n'est JAMAIS consulté, docblock `:16-20`). `AuthContext.tsx:110-120` `clearPerUserFeatureStorage` appelle désormais `clearConsentAcceptedFlag()` (`:120`) au logout (`:271`) ET login (`:300`). Confirme le "one-line fix" + GDPR Art.7(1)/Apple 5.1.2(i).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : refactor C1 hexagonal (extraction vers `consentStorageService`) propre ; TD-AS-01 namespacing respecté.

### P0.B9 — VERDICT: DONE
- Marqueur roadmap actuel : ✅
- État réel vérifié : `location_to_llm` présent dans FE. `consentScopes.ts` (renommé depuis `thirdPartyAiConsent.ts`) déclare le scope ; surfacé dans `AiConsentSheetContent.tsx:137` (`scope:'location_to_llm'`, libellé coarse-location `:129`) + `SettingsAiConsentCard.tsx:10-12` (import `THIRD_PARTY_AI_SCOPES`). Le scope n'est donc plus absent du FE (claim audit "BE retournait false → location silently dropped" résolu).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B10 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 — `Info.plist` ne contient QUE `NSLocationWhenInUseUsageDescription` (ligne 68), aucun `NSLocationAlways*` (grep exhaustif 1 hit). `app.config.ts` when-in-use only. Le sous-claim "drift NSLocationAlways*" est FALSE-CLAIM résiduel (corrigé). Non re-vérifié indépendamment ; preuve D3 robuste.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B11 — VERDICT: PARTIAL
- Marqueur roadmap actuel : ✅
- État réel vérifié : L'EXIF strip est EFFECTIVEMENT toujours wiré en prod — les 3 sites de composition passent toujours un `SharpImageProcessor` : `chat-module.ts:207`, `:286` (`buildCompareImageProcessor`), `:801`. DONC pas de risque réel "EXIF intact shipped". MAIS le fix demandé par l'audit ("Add boot assert dans chat-module") n'a PAS été fait : grep `assert`/EXIF boot-check dans `chat-module.ts` = 0 hit pertinent (les seuls `throw` sont des guards "build() must be called" `:334` / autre `:399`). Le fallthrough silencieux reste : `image-processing.service.ts:153-165` `stripExif` retourne l'input untouched si `!this.imageProcessor`, avec un commentaire "intentionally observable" mais AUCUN log/metric/assert — l'"observabilité" repose sur le fait qu'un test le détecterait, pas sur une garde runtime. Une régression de wiring en prod (oubli d'injection) shipperait EXIF intact silencieusement, exactement le risque que l'audit voulait fermer.
- CHECKBOX-FLIP : oui → ⚠️ (PARTIAL). Raison : la mitigation defense-in-depth demandée (boot assert / log / metric) n'est pas livrée ; le ✅ surévalue l'état. Le risque résiduel est faible (3 sites tous wirés au HEAD) mais le fix explicite est absent.
- Amélioration/debt : ajouter un boot assert dans `chat-module.build()` (`if (!imageProcessor) throw`) OU un `logger.warn`/metric dans la branche `!this.imageProcessor` de `stripExif`. Effort réel ~15-30 min.

### P0.B12 — VERDICT: OPS-HUMAN (reste OUVERT)
- Marqueur roadmap actuel : ❌🧑‍🔧
- État réel vérifié : `museum-web/public/.well-known/pgp-key.txt:10` contient toujours le token littéral `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` (+ commentaire `:8`). `security.txt:13` garde la ligne `Encryption: https://musaium.com/.well-known/pgp-key.txt`. AUCUN CI gate sur le token (grep workflows = 0 hit). Ni clé réelle générée, ni ligne `Encryption:` retirée, ni gate ajouté.
- CHECKBOX-FLIP : non (❌🧑‍🔧 correct — reste ouvert)
- Amélioration/debt : action ops (générer Ed25519 OU retirer la ligne) + ajouter un sentinel CI bloquant sur le placeholder AVANT prod (le CLAUDE.md "Pièges connus" le réclame déjà — le gate n'existe toujours pas).

### P0.B13 — VERDICT: OPS-HUMAN (NOT-VERIFIABLE-BY-CODE)
- Marqueur roadmap actuel : ❌🧑‍🔧
- État réel vérifié : `security@musaium.com` référencé partout côté code (`security.txt:6` Contact, `security/page.tsx:38-41`, `security-content.ts:28`) mais le provisioning de la mailbox (alias OVH→Gmail) n'est pas vérifiable par le code. Aucun changement code attendu ; le claim "SECURITY.md ment sans mailbox" est une dette ops.
- CHECKBOX-FLIP : non (❌🧑‍🔧 correct)
- Amélioration/debt : smoke RFC 9116 (envoi test vers security@) à exécuter par Tim ; non automatisable côté repo.

### P0.B14 — VERDICT: OPS-HUMAN (reste OUVERT + gap code résiduel)
- Marqueur roadmap actuel : ❌🧑‍🔧
- État réel vérifié : DEUX faits. (1) ops : Langfuse Cloud actif `museum-backend/.env:178-183` (`LANGFUSE_ENABLED=true`, keys `sk-lf-…`/`pk-lf-…` committées, `LANGFUSE_BASE_URL=https://cloud.langfuse.com`) ; DPA non signable par le code ; `docs/legal/dpa-signed/` N'EXISTE PAS (confirmé absent). (2) gap code : le dossier de conformité dédié `docs/compliance/SUBPROCESSORS.md` (Art.28, table vendors 1..19) a TOUJOURS 0 row Langfuse (grep `langfuse` = 0 hit ; la table saute 1,2,3,5,6,7,9,12,18,19, pas de Langfuse). NB : la canonical web-facing `privacy-content.canonical.json:67,242` LISTE bien Langfuse (c'est ça que D3/B15 a vérifié) — mais c'est une surface différente de SUBPROCESSORS.md. Le claim B14 vise spécifiquement SUBPROCESSORS.md, qui reste sans Langfuse.
- CHECKBOX-FLIP : non (❌🧑‍🔧 correct — reste ouvert)
- Amélioration/debt : (a) Tim signe DPA Langfuse + crée `docs/legal/dpa-signed/` ; (b) ajouter une row Langfuse à `docs/compliance/SUBPROCESSORS.md` (action code, ~10 min, indépendante de la signature) — actuellement la canonical et le dossier conformité divergent.

### P0.B15 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 (canonical `privacy-content.canonical.json` 19 vendors EN+FR ; route `/subprocessors/page.tsx` existe ; Footer lie privacy/terms/subprocessors/cookies). Spot-check de mon côté : Langfuse présent dans la canonical `:67,242`. Non diffé item-par-item HTML vs canonical (même doute mineur que D3).
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : voir B14 — la canonical web liste Langfuse mais le dossier Art.28 `SUBPROCESSORS.md` ne le liste pas (incohérence inter-surfaces à réconcilier).

### P0.B16 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 (âge 15 cohérent 3 surfaces, version 1.0.0/2026-05-21 synced ; FE dérive des canonical tokens → drift empêché ; POLICY_VERSION BE `2026-06-01` = version consent distincte). Non re-vérifié ligne-à-ligne ; preuve D3 robuste.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : néant.

### P0.B17 — VERDICT: PARTIAL (OPS-HUMAN résiduel)
- Marqueur roadmap actuel : ⚠️
- État réel vérifié : Code + `.env.example` + `.env.production.example` NETTOYÉS — grep `ANTHROPIC_API_KEY`/`anthropicApiKey`/`@anthropic-ai` dans `museum-backend/src` + les deux exemples = 0 hit. MAIS le fichier LIVE `museum-backend/.env:108` contient TOUJOURS une clé réelle d'apparence valide : `ANTHROPIC_API_KEY=sk-ant-api03-9mbw1…` (clé complète présente). Cette clé est soit fuitée (à révoquer côté provider), soit dead-config oubliée dans le `.env` local. La rotation/révocation = ops humain, non faisable par le code.
- CHECKBOX-FLIP : non (⚠️ correct — PARTIAL, code DONE / rotation ops ouverte)
- Amélioration/debt : Tim doit révoquer la clé `sk-ant-api03-…` côté console Anthropic (elle a transité dans des `.env` et potentiellement l'historique) PUIS retirer la ligne du `.env` prod. Une clé Anthropic réelle traînant dans un `.env` non versionné mais présent sur disque reste un risque.

### P0.B18 — VERDICT: DONE
- Marqueur roadmap actuel : ✅ (DONE-DEV `71f103b35` #294)
- État réel vérifié : Confirmé par D3 (route `/terms/page.tsx` + `terms-content.canonical.json` ; `/cookies/page.tsx` ; Footer lie les 4 ; test garde-fou `Footer.cookies-terms-subprocessors.test.tsx`). Doute D3 (page cookies statique vs vraie bannière consent-tool) non tranché ici non plus.
- CHECKBOX-FLIP : non (✅ correct)
- Amélioration/debt : confirmer si `/cookies` est une bannière interactive de consentement (e-Privacy Art.5(3)) ou une page descriptive — gap éventuel hors périmètre B18 strict.

### P0.B19 — VERDICT: OPS-HUMAN (NOT-VERIFIABLE-BY-CODE — reste OUVERT)
- Marqueur roadmap actuel : ❌🧑‍🔧
- État réel vérifié : Aucune trace IaC/sentinel. `infra/` ne contient que `grafana/`, `langfuse/`, `nginx/` — pas de Terraform (`find *.tf` = 0). Aucun boot-check `GetPublicAccessBlock`/`PublicAccessBlock`/`BlockPublicAcls` dans `museum-backend/src` (grep = 0 hit). Le S3 PAB reste "operator responsibility" (`docs/incidents/BREACH_PLAYBOOK.md` cité par l'audit). Ni Terraform ni sentinel CI boot-check livré.
- CHECKBOX-FLIP : non (❌🧑‍🔧 correct — reste ouvert)
- Amélioration/debt : alternative code-side faisable sans Terraform = sentinel boot-check qui appelle `GetPublicAccessBlock` au démarrage et fail-fast si non bloqué (l'audit le proposait). Actuellement zéro défense automatisée contre un bucket world-readable.

---

## Comptage par verdict (19 items)

| Verdict | Items | N |
|---|---|---|
| DONE | B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B15, B16, B18 | 13 |
| PARTIAL | B11, B17 | 2 |
| OPS-HUMAN (ouvert) | B12, B13, B14, B19 | 4 |
| FALSE-CLAIM | — | 0 |

(B17 est compté PARTIAL ; sa moitié ops reste ouverte. B11 PARTIAL = fix demandé absent malgré risque réel faible.)

## CHECKBOX-FLIPS recommandés
- **P0.B11 : ✅ → ⚠️** — le boot assert/log/metric demandé par l'audit n'est PAS livré ; l'EXIF strip marche en prod (3 sites wirés) mais la garde defense-in-depth manque. Le ✅ surévalue.
- Aucun autre flip. B12/B13/B14/B19 restent ❌🧑‍🔧 (correct). B17 reste ⚠️ (correct).

## Ops-humain encore ouverts
- B12 — clé PGP réelle OU retrait ligne `Encryption:` + CI gate placeholder.
- B13 — mailbox `security@musaium.com` (NOT-VERIFIABLE-BY-CODE).
- B14 — DPA Langfuse signé + `docs/legal/dpa-signed/` + row Langfuse dans `SUBPROCESSORS.md` (gap code).
- B17 — révocation/rotation clé `sk-ant-api03-…` (présente live `.env:108`).
- B19 — S3 PAB IaC/sentinel (NOT-VERIFIABLE-BY-CODE, zéro trace).

## Top 3 améliorations/debt
1. **B11** — ajouter boot assert imageProcessor dans `chat-module.build()` ou log/metric dans `stripExif` fallthrough (~15-30 min, ferme le seul gap de fix dans B1-B11).
2. **B14/B15 incohérence inter-surfaces** — Langfuse listé dans la canonical web (`privacy-content.canonical.json`) mais ABSENT du dossier Art.28 `docs/compliance/SUBPROCESSORS.md` (table 1..19 sans Langfuse). Réconcilier (~10 min, indépendant de la signature DPA).
3. **B12/B19 — défenses CI manquantes** : le placeholder PGP `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` n'a aucun CI gate bloquant (le CLAUDE.md le réclame), et le S3 PAB n'a aucun boot-check `GetPublicAccessBlock`. Les deux sont automatisables côté repo sans attendre l'action ops.
