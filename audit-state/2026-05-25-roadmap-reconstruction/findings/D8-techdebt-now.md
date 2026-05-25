# DOMAINE 8 — TECH_DEBT réconciliation + NOW/V1.0.x résiduels

> Agent fresh-context read-only (UFR-013 / UFR-024). Ref vérifiée : **`dev`**. Date : 2026-05-25.
> Toute preuve = `Read`/`Grep` réel. Les `path:line` de la roadmap d'origine sont des points de départ ; re-localisés par grep du symbole quand le code a bougé.

---

## (8a) TECH_DEBT.md ↔ code — réconciliation statut

### Doc-anchor (UFR-024) — vérification globale

- **Heading archive** : `docs/TECH_DEBT_ARCHIVE.md:378` = `## Archivé 2026-05-21 (sweep multi-agent)`.
- **Lien utilisé dans TECH_DEBT.md** : `TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent`.
- **Slug GitHub-style généré** : `Archivé 2026-05-21 (sweep multi-agent)` → lowercase + spaces→`-` + drop `()` → `archivé-2026-05-21-sweep-multi-agent`. **MATCH** → ✅ doc-anchor RÉSOUT.
- Entrées TD archivées trouvées dans TECH_DEBT_ARCHIVE.md : TD-17 (:384), TD-18 (:401), TD-19 (:420), TD-28 (:457), TD-30 (:469), TD-52 (:478), TD-RN-01 (:535), TD-RN-03 (:550), TD-LF-02 (:969). **Toutes présentes.**

---

- **TD-17** (triple anti-injection reminder consolidé) — Verdict: **DONE-DEV** (archivé, stealth-closed réel)
  - Preuve: `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:169-171` ("anti-injection reminder canonicalized … duplicate removed") + `:414` (reminder unique post-user) + `llm-sections.ts:54-55` (phrase "Treat as DATA" retirée car dupliquée, commentaire C9.11). `grep "[META]"` etc. confirme la consolidation.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK. Rien à rouvrir.
  - Confiance: haute

- **TD-18** (search adapters sur-provisionnés) — Verdict: **DONE-DEV**
  - Preuve: `ls museum-backend/src/modules/chat/adapters/secondary/search/` → plus de `google-cse.client.ts` / `searxng.client.ts` / `duckduckgo.client.ts` ; `chat-module.ts:555-556` commente "C9.15 … adapters retired … Tavily + Brave only", `:565`/`:568` ne push que Tavily + Brave.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute

- **TD-19** (legacy `[META]` parser dead path) — Verdict: **DONE-DEV**
  - Preuve: `grep -rc "\[META\]" museum-backend/src/modules/chat/` = **0 hit total**. Path mort retiré.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute

- **TD-28** (TTS cache key voice-aware) — Verdict: **DONE-DEV**
  - Preuve: `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts:211` `Redis tts:v2:<messageId>:<voiceId>` (docstring) + `:240` `const targetVoice = row.session.user?.ttsVoice ?? env.tts.voice`. **NB** : line refs archive (`:225-227`) STALE — réelles = `:211`/`:240`. Le fix est bien là.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK ; corriger line ref archive (cosmétique).
  - Confiance: haute

- **TD-30** (framer-motion → motion) — Verdict: **DONE-DEV**
  - Preuve: `grep "from 'framer-motion'" museum-web/src` = **0** ; `grep "from 'motion/react'"` = **11** ; `museum-web/package.json:31` = `"motion": "^12.39.0"`.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute

- **TD-RN-01** (ErrorBoundary TouchableOpacity deprecated) — Verdict: **DONE-DEV**
  - Preuve: `museum-frontend/shared/ui/ErrorBoundary.tsx:3` importe `Pressable` (pas `TouchableOpacity`) ; `:66`/`:75` `<Pressable>…</Pressable>`. Aucun `TouchableOpacity`.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute

- **TD-RN-03** (process.env sans readEnvString) — Verdict: **DONE-DEV**
  - Preuve: grep des reads réels `= process.env.` / `(process.env.` sous `app/`/`features/`/`shared/` (hors `env.ts`, hors comments, hors tests) = **0**. Tous les call-sites passent par `readEnvString` (canonical reader `shared/lib/env.ts`).
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute

- **TD-52** (`seed-pilot-museums.sh` cassé) — Verdict: **DONE-DEV** (script supprimé — option B)
  - Preuve: `museum-backend/scripts/seed-pilot-museums.sh` absent du working tree. Canonical intact : `scripts/seed-museums.ts` + `package.json` `"seed:museums"`. Caveat archive honnête : commit de suppression introuvable (`git log --all` vide) — absence prouvée, pas l'historique.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK.
  - Confiance: haute (script absent confirmé ; doute mineur sur la traçabilité du retrait, déjà noté dans l'archive)

- **TD-LF-02** (Langfuse CallbackHandler sur LangChain) — Verdict: **DONE-DEV**
  - Preuve: `langchain.orchestrator.ts:41` importe `LangfuseCallbacksRef`, `:60` "TD-LF-02 — folds the Langfuse CallbackHandler", `:299` `const callbacksRef: LangfuseCallbacksRef = {}`, `:438` "opt-in LangChain CallbackHandler ref" ; `package.json:157` `"langfuse-langchain": "~3.38.0"` ; test `tests/unit/chat/langfuse-callback-wiring.test.ts` existe.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ — archive correcte, anchor OK. (Résiduel honnête noté dans l'archive : vérif "cost UI non-zero" = étape ops live, hors code.)
  - Confiance: haute

- **TD-47** (RSC `api.ts` happy-path ne forward pas trace headers) — Verdict: **OPEN** (résiduel réel, re-scopé correct)
  - Preuve: `docs/TECH_DEBT.md:573-582`. Le symptôme original "pas d'init Sentry tracePropagationTargets" est FAUX (init shippé : `museum-web/instrumentation-client.ts:12`, `sentry.server.config.ts:12`). **Résiduel réel** : le wrapper `fetch` manuel dans `museum-web/src/lib/api.ts` (+ le `apiPut` local, gotcha CLAUDE.md confirmé "apiPut n'existe pas") ne forward PAS `sentry-trace`/`baggage` sur le happy-path RSC. Symptôme P2 informational.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ reste OPEN P2 — corriger le texte (init shippé, résiduel = RSC happy-path uniquement). Pas un blocker launch.
  - Confiance: haute (lecture du bloc complet)

- **TD-20** (Langfuse generations 4 paths non-LangChain) — Verdict: **DONE-DEV** (résolu 2026-05-21)
  - Preuve: `museum-backend/src/shared/observability/derive-tier.ts` existe ; `text-to-speech.openai.ts:94-108` (`safeTrace` + `generation` + `usage:{input:text.length, unit:'CHARACTERS'}`) ; `audio-transcriber.openai.ts:180,236-240` (`generation` STT) ; `llm-guard.adapter.ts` event ; `package.json:156-157` langfuse + langfuse-langchain.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ cluster TD-20 résolu — MAIS NE PAS marquer 20a/20b fermés (ci-dessous).
  - Confiance: haute

- **TD-20a** (museumId absent sur paths guardrail) — Verdict: **OPEN**
  - Preuve: `museum-backend/src/modules/chat/useCase/guardrail/guardrail-audit-payload.ts:17-23` `interface GuardrailAuditContext` ne porte **PAS** `museumId` (champs: sessionId/userId/requestId/ip/locale). `llm-guard.adapter.ts:105-106,318` commente explicitement "museumId is honestly ABSENT on this path". Fermer = changement contrat route-level.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ reste OPEN (V1.0.x / post-launch). Non-blocker.
  - Confiance: haute

- **TD-20b** (STT unit interim BYTES) — Verdict: **OPEN**
  - Preuve: `audio-transcriber.openai.ts:236-240` émet encore `usage:{ input: byteLength }` + `unit:'BYTES'` (`:240`). Pas de `getAudioDurationSeconds`/`SECONDS`. `BYTES` n'est pas un `ModelUsageUnit` valide → rangé en metadata interim (D-Q1 deferred).
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ reste OPEN (deferred D-Q1). Non-blocker.
  - Confiance: haute

- **TD-OP-01** (opossum sans dispose/shutdown) — Verdict: **OPEN** (cross-ref DOMAINE 4)
  - Preuve: `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts` — `grep "dispose\|shutdown\|stop()"` = **0 hit** (exit 1). Le breaker (`:70,84`) n'a aucune méthode de teardown. Symptôme Stryker open-handle confirmé. TECH_DEBT.md:1041.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN 🚨 — verdict cohérent avec DOMAINE 4. NICE_TO_HAVE pre-V1.
  - Confiance: haute

- **TD-AS-01** (async-storage keys non-namespacés) — Verdict: **OPEN** (cross-ref DOMAINE 6)
  - Preuve: préfixes hétérogènes constatés sur les call-sites : `app.themeMode`, `cert-pinning.kill-switch.v1`, `@musaium/completed_sessions`, `musaium.analytics.consent`, `runtime.*`, `settings.*`, `carnet.untitledSession`, `museum.*`, `dashboard.savedSessions`, `auth.refreshToken`. Mix `@musaium/` + `musaium.` + ~10 bare prefixes → bien > 11 familles. Pas de convention `musaium.<feature>.<key>` ni reader de migration.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN 🚨 — verdict cohérent avec DOMAINE 6. NICE_TO_HAVE pre-V1.
  - Confiance: haute

---

## (8b) NOW V1.0.x + "NEW small" + "Cluster C résiduels"

- **C3.5** (useCompareImage hook orphan) — Verdict: **OPEN** (orphan confirmé)
  - Preuve: `museum-frontend/features/chat/application/useCompareImage.ts` existe (+ test). Grep des imports sous `app/`/`features/` = **0 consumer** (seule mention = un commentaire dans `imageComparisonApi.ts:32`). Le hook n'est câblé à aucun écran.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — hook dormant (feature compare livrée côté BE/route mais non branchée à l'UI mobile). Non-blocker.
  - Confiance: haute

- **C3.7** (fallbackVisualThreshold jamais lu) — Verdict: **OPEN** (orphan config confirmé)
  - Preuve: `museum-backend/src/config/env.ts:345` `fallbackVisualThreshold: toNumber(process.env.VISUAL_FALLBACK_VISUAL_THRESHOLD, 0.4)` + déclaré `env.types.ts:413`. Grep du symbole hors `env.ts`/`env.types.ts` = **0 read** (seule autre mention = docstring `compare-result.types.ts:16`). La valeur de config n'est jamais consommée par la logique de comparaison.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — soit câbler le score-floor, soit retirer la var. Non-blocker.
  - Confiance: haute

- **C6.5** (wording "503 fail-open" vs fail-CLOSED réel) — Verdict: **PARTIAL / doc-wording**
  - Preuve: le code est fail-CLOSED correct sur l'encoder : `compare.use-case.ts:117` "encoder outage maps to 503; no persist (avoid phantom audit turn)" ; `chat-compare.route.ts:184` `statusCode: 503` ; `compare-result.types.ts:16` "encoder_unavailable … Mapped to HTTP 503". Le reranker, lui, est légitimement fail-OPEN (`rerank-phase.ts:28` "before fail-open", "Returns the input unchanged on any failure"). Aucun commentaire CODE ne mislabel le 503 encoder en "fail-open" (grep "fail-open" dans la route/types compare = 0). → le mauvais wording "503 fail-open" est dans la ROADMAP/doc, pas dans le code.
  - Ref vérifiée: `dev`
  - Action roadmap: ✅ code correct (fail-CLOSED) — corriger uniquement le wording roadmap. Non-blocker.
  - Confiance: haute (code) / moyenne (doute : je n'ai pas trouvé de string user-facing qui dirait "fail-open" ; si elle existe ailleurs, à re-grep — mais le code interne est sain)

- **C10 ChooseAnother** (`home.tsx:96-109` → réellement `ProactiveMuseumBanner.tsx`) — Verdict: **OPEN** (path STALE)
  - Preuve: le bouton n'est PAS dans `home.tsx` (`(tabs)/home.tsx:96-109` = `<ProactiveMuseumBanner>` props `onStart`/`onDismiss` seulement). Le prop `onChooseAnother` est défini dans `features/chat/ui/ProactiveMuseumBanner.tsx:46,75-79` et **fallback sur `onDismiss` quand absent** (`:77-79`). `home.tsx` ne passe PAS `onChooseAnother` → le bouton "Choisir un autre musée" dismisse silencieusement au lieu d'ouvrir le choix.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — câbler `onChooseAnother` depuis home OU retirer le bouton. Corriger le path:line (now `ProactiveMuseumBanner.tsx`, pas `home.tsx`). Non-blocker.
  - Confiance: haute

- **C10 race expo-speech / server TTS** — Verdict: **OPEN** (cross-ref I-CMP3 DOMAINE 5)
  - Preuve: deux moteurs TTS coexistent — device `expo-speech` (cf I-CMP3 `useChatSession.ts`) et server TTS via `useTextToSpeech.ts`. Le double-playback race est un gap a11y connu listé en I-CMP3 (DOMAINE 5). Je confirme l'existence des deux moteurs ; le détail du race revient à D5.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN — verdict porté par I-CMP3 (D5) ; cross-ref. Non-blocker (a11y).
  - Confiance: moyenne (doute : analyse fine du race = scope I-CMP3/D5, pas re-fait ici pour éviter doublon)

- **C10 Switch accessibilityLabel** (`SettingsAccessibilityCard.tsx:32`) — Verdict: **OPEN** (recoupe I-CMP3)
  - Preuve: `museum-frontend/features/.../ui/SettingsAccessibilityCard.tsx` `<Switch value={enabled} onValueChange={…} trackColor={…} />` — **aucun `accessibilityLabel`**. Le label visuel `t('settings.audio_description')` n'est pas associé au Switch (pas de `accessibilityLabelledBy`/label propre).
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN — verdict unique, cross-ref I-CMP3 (D5). Fix 1 prop. Non-blocker.
  - Confiance: haute

- **Accept-Language `fr-FR` strict-equals** (`chat-compare.route.ts:77-82`) — Verdict: **OPEN**
  - Preuve: `resolveLocale` (`chat-compare.route.ts:77-82`) fait `if (clientLocale === 'fr' || clientLocale === 'en') return clientLocale; return DEFAULT_LOCALE ('en')`. Or `req.clientLocale` = sortie de `parseAcceptLanguageHeader` (`shared/i18n/locale.ts:39-49`) qui retourne le **premier tag BRUT non normalisé** (ex `'fr-FR'`, pas `'fr'`). Donc `'fr-FR' === 'fr'` = false → fallback EN. Un user FR envoyant `Accept-Language: fr-FR` (sans body.locale) reçoit la comparaison en anglais. Les autres routes (chat-session/message/media) passent `clientLocale` brut à un service qui normalise via `extractLangCode` (`locale.ts:21`) → seul chat-compare a le strict-equals bug.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — normaliser via `extractLangCode`/`resolveLocale` dans la route compare. Impact: locale dégradée silencieuse, pas un crash. Non-blocker mais visible FR.
  - Confiance: haute

- **Maestro audio-recording-flow.yaml cassé** — Verdict: **OPEN** (broken flow confirmé)
  - Preuve: `museum-frontend/.maestro/audio-recording-flow.yaml` dépend de l'injection d'un fixture audio via `MAESTRO_AUDIO_FIXTURE=<path>` (header L7-11 + `fixtures/audio.md` existe). MAIS `grep MAESTRO_AUDIO_FIXTURE museum-frontend --include="*.ts(x)"` = **0 hit** → le harness n'est PAS câblé dans l'app. Le `longPressOn "Hold to talk"` enregistre du silence → Phase 3 `extendedWaitUntil visible "Who painted the Mona Lisa"` ne peut pas passer (STT n'a rien) → flow fail.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — câbler `MAESTRO_AUDIO_FIXTURE` dans le pipeline d'enregistrement OU marquer le flow skip. Non-blocker launch (CI Maestro matrix ne dépend pas de ce flow si non listé). Doute: vérifier s'il est dans un shard CI (non re-vérifié ici).
  - Confiance: haute (harness absent prouvé) / moyenne (sur l'inclusion CI exacte)

- **reviews.userName ghost** (`useReviews.ts:110-113` → réellement `:17,94,98`) — Verdict: **OPEN** (ghost field confirmé)
  - Preuve: FE `useReviews.ts:17,94` `submitReview(rating, comment, userName)` + `reviewApi.ts:30,35` met `userName` dans le body. MAIS BE `review.route.ts:41-42` "SEC: userName is derived server-side … never accepted from client" — la route ne destructure que `{ rating, comment }` (`:51-53`) et `createReview.useCase.ts:57` calcule `derivedName = buildReviewDisplayName(...)`. Le `userName` envoyé par le FE est **ignoré** côté serveur → champ fantôme sur le path submit.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — retirer l'arg `userName` de `submitReview`/`reviewApi` (dead data). Path:line STALE (now `:17,94,98`). Non-blocker (sécurité OK by design, c'est juste du code mort FE).
  - Confiance: haute

- **TTS cache .mp3 post-Opus** (`useTextToSpeech.ts:61,169`) — Verdict: **OPEN** (mismatch confirmé)
  - Preuve: FE `useTextToSpeech.ts:61` cache `${dir}${messageId}.mp3` + `:79` write + `:169` fallback `data:audio/mpeg;base64,…`. MAIS BE `text-to-speech.openai.ts:46` `response_format: 'opus'` + `:148` retourne `contentType: 'audio/ogg'`. Donc du contenu Opus/OGG est stocké sous extension `.mp3` et étiqueté `audio/mpeg`. Extension + MIME faux.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — aligner l'extension/MIME FE sur OGG/Opus (ou refléter le `contentType` BE). Sur natif expo-av sniffe souvent le contenu → playback peut marcher quand même, mais le contrat est incorrect. Non-blocker probable.
  - Confiance: haute

- **W2.2 branding doc fix** — Verdict: **cross-ref D7a / DOMAINE 7**
  - Preuve: gap connu "branding ZÉRO consumer FE mobile" listé en D7a (P0.F W2.x) + TD-49/TD-50 (TECH_DEBT.md:597,613 branding admin EN-only + URL-only logo). Non re-vérifié ici (scope D7).
  - Ref vérifiée: `dev`
  - Action roadmap: cross-ref D7a — le verdict shipped/⚠️ est porté par DOMAINE 7. Doc fix only.
  - Confiance: moyenne (déféré à D7 par design)

- **SwipeableConversationCard RTL borders** — Verdict: **OPEN**
  - Preuve: `museum-frontend/features/conversation/ui/SwipeableConversationCard.tsx:121-122` `borderTopRightRadius` + `borderBottomRightRadius` (props physiques Left/Right). Aucun `borderTopStartRadius`/`borderTopEndRadius` ni `writingDirection`. Viole le gotcha RTL CLAUDE.md (props logical-side obligatoires sous `features/`).
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — convertir en `borderTopEndRadius`/`borderBottomEndRadius`. Non-blocker (cosmétique RTL).
  - Confiance: haute

- **metric-naming.mjs duplicate** — Verdict: **OPEN** (duplicate + drift confirmés)
  - Preuve: DEUX fichiers — `scripts/sentinels/metric-naming.mjs` (221 lignes, root) et `museum-backend/scripts/sentinels/metric-naming.mjs` (145 lignes). `diff` = **DIFFERENT** (divergence réelle, pas une copie). Invoqués par 2 scripts distincts : `package.json:25` (root) et `museum-backend/package.json:23` (BE). CI mirror (`sentinel-mirror.yml:127`) appelle uniquement la version root.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN — dédupliquer (garder une source de vérité). Risque: les 2 sentinels divergent → faux verts/faux rouges selon l'invocation. Non-blocker mais dette CI réelle.
  - Confiance: haute

- **workspace-links.mjs not in CI mirror** — Verdict: **OPEN** (gap confirmé)
  - Preuve: `scripts/sentinels/workspace-links.mjs` existe ; `grep -rln "workspace-links" .github/` = **0** (pas dans `sentinel-mirror.yml` ni aucun workflow). Présent seulement local : `package.json`, `.husky/post-merge`, `.husky/pre-commit`. → un commit qui bypasse les hooks locaux ne sera PAS rattrapé par la CI mirror.
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN — ajouter un Mirror Gate `workspace-links` dans `sentinel-mirror.yml` (cohérent avec la doctrine anti-bypass UFR-020). Non-blocker mais trou d'enforcement.
  - Confiance: haute

- **AUDIT_ACCOUNT_DELETED log AFTER cleanup** — Verdict: **OPEN** (ordering = log AVANT, pas APRÈS)
  - Preuve: `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-profile.route.ts:150-162` — `auditService.log({ action: AUDIT_ACCOUNT_DELETED, … })` est appelé **AVANT** `await deleteAccountUseCase.execute(user.id)` (`:161`). L'item NOW veut le log APRÈS cleanup. Safe pour FK (audit `actorId` = int simple, pas de FK ; `deleteAccount.useCase.ts:42` "audit_logs … NOT erased … users CASCADE"), donc logger après est faisable et plus exact (sinon on log une suppression qui peut échouer).
  - Ref vérifiée: `dev`
  - Action roadmap: ⚠️ OPEN V1.0.x — déplacer le `auditService.log` après `deleteAccountUseCase.execute`. Non-blocker (correctness mineure : risque de log fantôme si le delete throw).
  - Confiance: haute

### NEEDS-OPS-HUMAN (confirmation état code adjacent uniquement)

- **C7.5** (device TTS smoke) — Verdict: **NEEDS-OPS-HUMAN**
  - Preuve: smoke sur device réel = action ops Tim (Maestro/CI ne pilote pas un vrai device audio out — cf. limite documentée dans `audio-recording-flow.yaml` header). Aucune action code possible.
  - Ref vérifiée: `dev`
  - Action roadmap: NEEDS-OPS-HUMAN — laisser tel quel, hors run.
  - Confiance: moyenne (hors-code par nature)

- **C8.x VDP / CRA** — Verdict: **NEEDS-OPS-HUMAN**
  - Preuve: VDP (vulnerability disclosure policy) / conformité CRA = process + légal, majoritairement hors-code (cf. I-CMP6 SBOM CRA Art.13 deadline 2027, prio basse). État code adjacent : SBOM BE généré non-signé (DOMAINE 5 I-CMP6).
  - Ref vérifiée: `dev`
  - Action roadmap: NEEDS-OPS-HUMAN — hors run, deadline 2027 (prio basse).
  - Confiance: moyenne (hors-code par nature)

---

## Synthèse comptage

**8a (13 IDs tranchés) :**
- DONE-DEV (archivé, stealth-closed réel, anchor OK) : TD-17, TD-18, TD-19, TD-28, TD-30, TD-RN-01, TD-RN-03, TD-52, TD-LF-02 = **9**
- DONE-DEV (résolu, cluster) : TD-20 = **1**
- OPEN : TD-47, TD-20a, TD-20b, TD-OP-01, TD-AS-01 = **5**
- Doc-anchor : **TOUS résolvent** (`#archivé-2026-05-21-sweep-multi-agent` ✅).

**8b (15 items path:line + 2 NEEDS-OPS-HUMAN + 2 cross-ref) :**
- OPEN : C3.5, C3.7, C10-ChooseAnother, C10-Switch-label, Accept-Language, Maestro-audio, reviews.userName, TTS-cache-mp3, SwipeableCard-RTL, metric-naming-dup, workspace-links-CI, AUDIT_ACCOUNT_DELETED-ordering = **12**
- PARTIAL / doc-wording (code correct) : C6.5 = **1**
- cross-ref (verdict porté ailleurs) : C10-race (I-CMP3/D5), W2.2 (D7a) = **2**
- NEEDS-OPS-HUMAN : C7.5, C8.x VDP/CRA = **2**

**Total verdicts D8 : ~28 items.**
