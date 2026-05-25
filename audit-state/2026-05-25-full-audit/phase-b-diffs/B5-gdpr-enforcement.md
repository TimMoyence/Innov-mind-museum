# B5 — Lot P0 GDPR/consent #294 (`71f103b35`) — Audit ENFORCEMENT RÉEL

**Reviewer** : senior sécurité/privacy read-only, fresh-context (UFR-022).
**Branche** : `dev` @ HEAD `89852f2a16`. Commit audité : `71f103b35` (465 fichiers).
**Angle** : consent VRAIMENT opposable ? erasure VRAIMENT complète ? tests adversariaux ? honnêteté ?

## Note : **8.5 / 10** — verdict **ENFORCEMENT SOLIDE** (avec 1 OPEN doc-assumé + scopes décoratifs)

Le consent third-party AI est **réellement opposable** (bloqué AVANT OpenAI, fail-CLOSED, pas juste loggé), l'erasure est **explicite + best-effort honnête** (pas un "DB cascade" mensonger), les tests sont **adversariaux** (consent-refusé, revoked, anon, AND-intersection), et l'honnêteté est **élevée** (commit dit "reclassify" I-SEC8, pas "fix" ; DeleteAccount documente "NOT a full DB-cascade deletion"). Les faiblesses sont des limites de périmètre documentées, pas des mensonges.

---

## ✅ Enforcement solide (prouvé par lecture)

### 1. Gate text/image bloque AVANT OpenAI, pas juste loggé
`consent-gate.ts:55-82` (`checkThirdPartyAiConsent`) :
- Construit `requiredScopes[]` (text et/ou image selon le payload), AND-intersection : `for (scope of requiredScopes) { if (!granted) return refusal }` — refuse si **ANY** scope manque (`:71-80`).
- Câblé dans `prepare-message.pipeline.ts:268-269` : `runConsentGate(...)` s'exécute **AVANT** `ensureSessionAccess` (`:271`), `persistMessage` (`:304`), enrichment (`:307`) et l'orchestrateur LLM. Un `PrepareRefused` court-circuite tout. → la requête refusée **ne touche jamais** OpenAI, ni Redis/BullMQ, ni la table message.
- Fail-CLOSED anon : `third-party-ai-consent-checker.ts:42-44` — `userId` nullish → `false` sans appel repo.
- Revoked = denial (`userConsentRepository.isGranted` ne retourne true que sur grant actif, prouvé `third-party-ai-consent-checker.test.ts:88-99`).
- Production wiring confirmé : `chat-module.ts:695` `buildThirdPartyAiConsentChecker()` → `:723` injecté dans `buildChatService` (pas seulement en test).

### 2. Path audio bloque aussi (403 avant STT)
`chat-media.route.ts:66-71` : `resolveActiveProviderForScope('audio')` → `consentChecker.isGranted(currentUser?.id, audioScope)` ; si `!granted` → `res.status(403).json({error:'consent_required', scope})` **AVANT** `chatService.postAudioMessage` (donc avant Whisper). Wiring prod : `:224` default param `buildThirdPartyAiConsentChecker()`.
- **Défense en profondeur bonus** : `postAudioMessage` (`chat-message.service.ts:368-415`) transcrit puis appelle `this.postMessage(...)` (`:406`) qui repasse par `prepare()` → le **gate text** se ré-applique sur le transcrit. Un user qui grant `audio` mais refuse `text` est donc bloqué au 2e gate. Solide.

### 3. Consent inheritance (B8) — clé namespacée + clear ordering correct
`consentStorageService.ts:29-38` : clé `musaium.consent.aiAccepted.${userId ?? '__anon'}`, userId dérivé du token. Legacy global `consent.ai_accepted` jamais consulté (`:17-20`). User A grant sous clé A → user B lit clé B (absente) → re-prompt. GDPR Art. 7 OK.
- Race correctement gérée : `AuthContext.tsx:300` (`logout`) et `:271` (`unauthorizedHandler`) appellent `clearPerUserFeatureStorage()` (→ `clearConsentAcceptedFlag`) **AVANT** `clearPersistedTokens()`, pour que la clé namespacée résolve encore l'userId. Commentaires `:117-119` + `:268-270` documentent l'ordre load-bearing. Pas de race anon-key.

### 4. DOB age-gate (A2) — hard-throw, plus de bypass `.optional()`
`auth.schemas.ts:17` : `dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` — **aucun `.optional()`**. Requête sans DOB → Zod 400. Malformé → 400.
- Defense-in-depth : `register.useCase.ts:108-110` `if (!dateOfBirth) throw badRequest('dateOfBirth is required')`. Mineur < 15 → 422 `MINOR_PARENTAL_CONSENT_REQUIRED` (`:115-122`). Calcul d'âge server-side. Honnête (commentaire `:105-107` explique la double-couche).

### 5. Erasure — suppression réellement prouvée (pas juste "fonction existe")
- **Brevo** (`brevo-remove-contact.test.ts`) : vérifie l'URL DELETE exacte `/v3/contacts/<encoded>?identifierType=email_id`, method=DELETE, header api-key (`:61-77`), 404 idempotent (`:79-87`), **et** que l'api-key ne fuit PAS dans le message d'erreur 5xx (`:90-104`). Adversarial.
- **Audio S3** (`audio-storage-s3.test.ts:275-291`) : `deleteByRef` appelle `deleteObjectsBatch(config, [key])` pour un ref s3 valide, no-op sinon. `findAudioRefsByUserId` testé (`chat-repository-audio-refs.test.ts:43-72` : dédup, IS NOT NULL, scope userId).
- **S3 image B4 (Art.17 = zéro match prod)** : `image-storage.s3.ts:126-146` scanne le préfixe complet `chat-images/` (le segment user est mid-key → un préfixe `chat-images/user-X/` matchait ZÉRO clé prod = le bug original), filtre boundary-safe `/user-X/` (`:124`, évite `user-42`↔`user-420`), + legacy DB fetcher pour clés sans segment, pagination gérée. Vrai fix.
- **Orchestration** (`deleteAccount.useCase.ts:69-123`) : ordre load-bearing image→audio→brevo→deleteUser (refs/email résolvables avant cascade). Wiring prod confirmé `auth/useCase/index.ts:201-207`.

### 6. Tests adversariaux (pas happy-path)
`prepare-message-pipeline-consent.test.ts` (le plus important) prouve : text DENIED → `kind:'refused'` + `persistMessage` NON appelé + `fetchEnrichmentData=0` + `resolveLocationForMessage=0` (`:183-209`) ; AND-intersection text-grant/image-deny → refused (`:232-291`) ; anon fail-closed sans persist (`:323-340`) ; revoked → refused (`:342-360`). C'est exactement la preuve "aucun appel LLM n'échappe sur scope refusé".

---

## ⚠️ Enforcement faible / contournable

### W1 — [LOW/doc] I-SEC8 reste **OPEN** au HEAD malgré "reclassify" #294
**SÉVÉRITÉ : LOW pour V1 (défendable), pas le "CRITIQUE" annoncé par l'A2-isec.**
- Code vérifié HEAD : `artwork-knowledge.entity.ts:10-60` n'a **aucune** colonne `museum_id` (clé `(title,artist,locale)`, `:11`). `typeorm-artwork-knowledge.repo.ts:19-21` `findById(id)` = `findOne({where:{id}})`, **zéro filtre tenant**. `prepare-message.pipeline.ts:357` injecte `row.title` (resolu d'un `currentArtworkId` client) dans `[CURRENT ARTWORK]`.
- **#294 n'a PAS scopé** — il a documenté ADR-061 (reclassify LOW). Le commit message dit littéralement "reclassify I-SEC8", pas "fix" → **honnête**.
- **Mon verdict indépendant** : `artwork_knowledge` est un catalogue PUBLIC scrapé (web), pas du contenu privé per-tenant. Il n'existe aucune donnée privée multi-tenant à "fuiter" en V1 → la qualif "cross-tenant bleed CRITIQUE" de `A2-isec.md:51` **surévalue**. Le risque réel = un user injecte un titre d'œuvre arbitraire (public) dans SON propre prompt. Auto-infligé, faible. La reclassification LOW est **défendable**.
- **MAIS** : `currentArtworkId` (`session.currentArtworkId`) n'est jamais validé contre `session.museumId` (point (b) de A2-isec valide). Devient un vrai risque dès que du knowledge privé per-musée arrive (V2 B2B). Trigger V2 documenté ADR-061. → **OPEN, à traiter en V2, pas un V1-blocker**. Contradiction inter-docs à réconcilier (ADR-061 LOW vs A2-isec CRITIQUE) — ma lecture tranche LOW.
- Fix court-terme si on veut fermer en V1 : valider `row` ∈ musée de session avant injection (rejet/null si mismatch), sans migration.

### W2 — [LOW] 3 des 8 scopes `third_party_ai_*` sont **décoratifs** (jamais enforced)
- Enforced : `text_openai`, `text_google`, `image_openai`, `image_google`, `audio_openai`.
- **Jamais enforced** : `third_party_ai_profile_openai` + `..._google` (aucun dispatch ne les consulte — grep src : seul `consent-audit-mapping.ts:14,30` connaît la catégorie 'profile', purement audit). `third_party_ai_audio_google` (`provider-resolver.ts:51-52` hard-pin audio→openai, donc `audio_google` jamais résolu).
- De plus, à un instant T un seul `LLM_PROVIDER` est actif → un seul scope text + un seul image sont "live". La mission demande "8 scopes enforced ou 1 ?" : réponse honnête = **5 enforçables, 1 text + 1 image + 1 audio effectivement live selon provider**. Pas un bug (profile = futur), mais surface de consent affichée FE > surface réellement opposable.

### W3 — [LOW] Erasure best-effort = orphelins S3/audio possibles après suppression du compte
`deleteAccount.useCase.ts:81-117` : chaque step externe (S3 image, audio, Brevo) est `try/catch` **swallow + log** ; la cascade DB (`:122`) s'exécute quand même. Donc si S3 est down au moment du delete, la row user disparaît mais les objets restent orphelins. **Honnêtement documenté** (`:46-49` "This is NOT a full deletion via DB cascade", R17). Filet de sécurité = cron `s3-orphan-purge` (rétention 180j par défaut). Acceptable mais l'erasure n'est pas garantie-immédiate-atomique pour le stockage objet — un DSAR strict pourrait l'exiger. Audit logs intentionnellement retenus (obligation légale, `:42-44`) — correct.

---

## 🔧 Reste à faire

1. **I-SEC8** : décision produit — soit fermer V1 par garde `row.museumId === session.museumId` au read (court, sans migration), soit acter formellement la reclassification LOW dans la roadmap et **réconcilier la contradiction** ADR-061 (LOW) vs `phase-a-roadmap/A2-isec.md:51` (CRITIQUE). Ma recommandation : LOW/V2 (pas de données privées tenant en V1), mais ajouter le tenant-check est ~10 lignes et ferme le débat.
2. **Scopes décoratifs** : soit masquer `profile_*` / `audio_google` du FE consent sheet tant que non enforced (éviter de promettre un contrôle inopérant — risque honnêteté GDPR), soit câbler leur enforcement. Sinon : commentaire explicite "future scope, non enforced V1" sur `CONSENT_SCOPES`.
3. **Erasure atomicité** : envisager une dead-letter / retry queue pour les steps externes échoués (au-delà du cron orphan-purge) si un DSAR exige preuve de suppression objet sous délai.
4. **Test gap mineur** : pas de test unitaire direct sur `checkThirdPartyAiConsent` isolé (couvert transitivement et solidement via `prepare-message-pipeline-consent.test.ts`) — acceptable.

---

### Honnêteté — verdict
Aucun mensonge détecté sur l'enforcement. Au contraire : commit "reclassify" (pas "fix") I-SEC8, `deleteAccount` documente explicitement que ce n'est pas une cascade-DB-complète, commentaires de gate précis sur l'ordre/le fail-closed. Le seul point d'honnêteté à surveiller = les 3 scopes décoratifs affichés FE mais non opposables (W2).
