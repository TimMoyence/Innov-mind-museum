# A9 — NOW / V1.0.x post-launch + NEW small + Cluster-C résiduels

> Agent fresh-context READ-ONLY (UFR-022 / UFR-013 / UFR-024). Ref: `dev` @ HEAD `89852f2a1`. Date: 2026-05-25.
> Périmètre = `docs/ROADMAP_PRODUCT.md` sections "V1.0.x post-launch" (L268-286), "NEW V1.0.x small" (L288-303), "C — Cluster items NOW résiduels" (L305-312).
> Cross-checked vs `audit-state/2026-05-25-roadmap-reconstruction/findings/D8-techdebt-now.md`. 62 commits depuis 2026-05-21 ré-évalués ; focus DONE-mais-pas-cochés (surtout a11y commit `e62b93f75` + security PR #293/#294).
> Toute preuve = `Read`/`Grep`/`git show` réel.

---

## SECTION 1 — V1.0.x post-launch (L268-286)

### C3.5 wire `useCompareImage` dans UI — VERDICT: STILL-OPEN
- État réel vérifié : `museum-frontend/features/chat/application/useCompareImage.ts` existe ; seul référent sous `app/`/`features/` = un commentaire dans `imageComparisonApi.ts`. Aucun écran consumer. Orphan.
- CHECKBOX-FLIP : non, reste [ ].
- Note : confirme D8.

### C3.7 score-floor gate (`fallbackVisualThreshold`) — VERDICT: STILL-OPEN
- État réel vérifié : `museum-backend/src/config/env.ts:345` parse `fallbackVisualThreshold` ; grep hors `env.ts`/`env.types.ts`/docstring = **0 read**. Jamais consommé.
- CHECKBOX-FLIP : non, reste [ ].

### C6.5 amend "503 fail-open" wording — VERDICT: STILL-OPEN (doc-only)
- État réel vérifié : code = fail-CLOSED correct (`compare.use-case.ts:117`, `chat-compare.route.ts:184` `503`). Le wording "503 fail-open" dans la ROADMAP/doc n'a PAS été corrigé (item toujours `[ ]`). C'est l'action doc qui reste à faire.
- CHECKBOX-FLIP : non, reste [ ] — c'est l'item de correction-wording lui-même qui est ouvert ; cocher reviendrait à dire "wording corrigé" alors qu'il ne l'est pas.

### C7.5 device TTS smoke iPhone — VERDICT: STILL-OPEN (NEEDS-OPS-HUMAN)
- État réel vérifié : action manuelle Tim pré-TestFlight, hors-code.
- CHECKBOX-FLIP : non, reste [ ].

### C10 ChooseAnother button wiring (`home.tsx:96-109` → `ProactiveMuseumBanner.tsx`) — VERDICT: STILL-OPEN
- État réel vérifié : `features/chat/ui/ProactiveMuseumBanner.tsx:46,75-79` — `onChooseAnother` fallback sur `onDismiss` quand absent ; `(tabs)/home.tsx` passe seulement `onStart`/`onDismiss`, jamais `onChooseAnother` → dismiss silencieux. Path roadmap STALE (le bouton est dans `ProactiveMuseumBanner.tsx`, pas `home.tsx`).
- CHECKBOX-FLIP : non, reste [ ].
- Note : corriger le path:line dans la roadmap (cosmétique).

### C10 race expo-speech + server TTS (`Speech.stop()` + unified path) — VERDICT: DONE-UNCHECKED
- État réel vérifié : `museum-frontend/features/chat/application/useChatSession.ts:123-129` = content-type partition explicite (server-TTS via `useAutoTts` possède tout message AVEC body ; `expo-speech` lit SEULEMENT `imageDescription` des messages SANS body → exactement un moteur par message, plus de double-playback) + `:142-155` `Speech.stop()` dans le cleanup d'effet (interrompt l'utterance précédente avant la suivante R4, halte au blur/unmount R3). Shippé par `e62b93f75` (feat a11y P0 I-CMP3 5/5, #298).
- CHECKBOX-FLIP : **oui → cocher [x]** — race fix + Speech.stop() shippés et testés (`useChatSession.audioDescription.test.ts`, 301 LOC).
- Note : item explicitement listé "Theme 3 Agent 04 B" dans la roadmap ; clos par I-CMP3.

### C10 Switch accessibilityLabel (`SettingsAccessibilityCard.tsx:32-36`) — VERDICT: DONE-UNCHECKED
- État réel vérifié : `features/settings/ui/SettingsAccessibilityCard.tsx:36-38` = `accessibilityRole="switch"` + `accessibilityLabel={t('settings.audio_description')}` + `accessibilityState={{ checked: enabled }}`. Les 3 props (Role/Label/State) présents. Shippé par `e62b93f75` (3 lignes ajoutées, test `SettingsAccessibilityCard.test.tsx`).
- CHECKBOX-FLIP : **oui → cocher [x]** — WCAG 4.1.2 + EN 9.4.1.2 fermés.

### C10 5 WCAG/EN 301 549 violations audio description path — VERDICT: DONE-UNCHECKED
- État réel vérifié : `e62b93f75` message "I-CMP3 (5/5)" + code : (a) Switch role/label/state → 4.1.2 + EN 9.4.1.2 ; (b) `Speech.stop()` cleanup `useChatSession.ts:149-155` → 2.2.2 (user-controlled stop sur blur/unmount) + contrôle pause ; (c) `StreamingBody.tsx:54` `accessibilityLiveRegion="polite"` → 3.3.2/AT props ; (d) drop du label statique masquant (`ChatMessageBubble.tsx:188` commentaire). Source finding `D5-lot5-a11y.md` ; reviewer APPROVED 91.2.
- CHECKBOX-FLIP : **oui → cocher [x]** — les 5 violations fermées par I-CMP3.

### C10 FE→BE write of `audioDescriptionMode` — VERDICT: STILL-OPEN
- État réel vérifié : le BE expose bien un PATCH preferences (`auth.schemas.ts:103`, `updateProfilePreferences.useCase.ts`, OpenAPI `openapi.ts:1144`). MAIS côté FE : `useAudioDescriptionMode.toggle()` → `audioDescriptionStore.toggle()` (`features/settings/infrastructure/audioDescriptionStore.ts`) écrit UNIQUEMENT le store Zustand-persist local. `mergeFromServer` (`:36-48`) ne fait que LIRE depuis `bootstrapProfile.ts:84`. Aucun call FE PATCH vers le profile-preferences endpoint (les seuls PATCH FE existants = content-preferences / tts-voice / memory/preference). Read works, write = zéro caller → cross-device sync cassé, exactement comme l'item le décrit.
- CHECKBOX-FLIP : non, reste [ ].

### Accept-Language `fr-FR` strict-equals (`chat-compare.route.ts:77-82`) — VERDICT: STILL-OPEN
- État réel vérifié : `resolveLocale` (`chat-compare.route.ts:77-82`) toujours `if (clientLocale === 'fr' || clientLocale === 'en') return clientLocale; return 'en'`. Aucune normalisation. `req.clientLocale` = tag brut (`'fr-FR'`) → `=== 'fr'` false → fallback EN. User FR (sans body.locale) reçoit l'anglais.
- CHECKBOX-FLIP : non, reste [ ].

### Maestro `audio-recording-flow.yaml` cassé — VERDICT: STILL-OPEN
- État réel vérifié : `.maestro/audio-recording-flow.yaml` existe ; `maestro/voice-record-and-tts.yaml` (orphan hors `.maestro/`) existe ; `MAESTRO_AUDIO_FIXTURE` = **0 hit** dans le code TS de l'app → harness audio jamais câblé, le flow ne peut pas passer.
- CHECKBOX-FLIP : non, reste [ ].

### Maestro flows AI badge + voice-intro + paywall — VERDICT: STILL-OPEN (PARTIEL connexe)
- État réel vérifié : item UFR-021 gap (~3 flows). `e62b93f75` a ajouté `settings-audio-description.yaml` (1 flow a11y) mais PAS les 3 flows badge/voice-intro/paywall ciblés. Non couvert.
- CHECKBOX-FLIP : non, reste [ ].

### `reviews.userName` ghost field — VERDICT: STILL-OPEN
- État réel vérifié : FE `features/review/application/useReviews.ts:17,93-94,98` passe `userName` à `submitReview` ; `reviewApi.ts:30,35` le met dans le body. BE `review.route.ts:41` "SEC: userName derived server-side … never accepted from client" → ignoré. Branche `409 already_reviewed` (`useReviews.ts:110-111`) = morte (BE n'émet jamais 409). Ghost field + dead branch confirmés. Path roadmap (`:110-113`) imprécis (réel `:17,93-94,98,110-111`).
- CHECKBOX-FLIP : non, reste [ ].

### TTS FE cache `.mp3` post-Opus (`useTextToSpeech.ts:61,169`) — VERDICT: STILL-OPEN
- État réel vérifié : FE `useTextToSpeech.ts:42,61,78` cache `<messageId>.mp3` + `:169` fallback `data:audio/mpeg;base64,…`. BE `text-to-speech.openai.ts` = `response_format:'opus'` + `contentType:'audio/ogg'`. Contenu Opus/OGG sous extension `.mp3` + MIME `audio/mpeg` faux.
- CHECKBOX-FLIP : non, reste [ ].

### W2.2 branding doc UFR-013 fix — VERDICT: STILL-OPEN (cross-ref D7a, doc-only)
- État réel vérifié : gap "branding zéro consumer FE mobile" porté par D7a/TD-49/TD-50 (non re-vérifié ici par design). La correction de claim "W2.2 shipped" dans la roadmap n'est pas faite (item `[ ]`).
- CHECKBOX-FLIP : non, reste [ ].

---

## SECTION 2 — NEW V1.0.x small (L288-303)

### `SUPPORTED_LOCALES` dedup BE+FE → `@musaium/shared/i18n` — VERDICT: STILL-OPEN
- État réel vérifié : 2 définitions distinctes — BE `shared/i18n/locale.ts` (+ `explanation-reasons.ts`, `auth.schemas.ts`) et FE `shared/config/supportedLocales.ts`. Pas de subpath `@musaium/shared/i18n` (`packages/musaium-shared/src/i18n` absent).
- CHECKBOX-FLIP : non, reste [ ].

### `hashEmail` 32-bit fold shared FE+web — VERDICT: STILL-OPEN
- État réel vérifié : encore dupliqué — FE `museum-frontend/shared/observability/sentry-scrubber.ts:27` ET web `museum-web/src/lib/sentry-scrubber.ts:28` définissent chacun leur `hashEmail`. Le shared pkg (`packages/musaium-shared/.../sentry-scrubber.ts:94`) utilise injection de dépendance (`deps.hashEmail`), pas une impl partagée. Le "flag for shared" n'est pas exécuté.
- CHECKBOX-FLIP : non, reste [ ].

### Brevo unsubscribe one-click UX — VERDICT: STILL-OPEN
- État réel vérifié : grep `List-Unsubscribe` / `unsubscribe` (one-click/route/header) BE = **0**. Promesse `dictionaries/{en,fr}.json` non backée.
- CHECKBOX-FLIP : non, reste [ ].

### `SwipeableConversationCard.tsx:121-122` RTL borders — VERDICT: STILL-OPEN
- État réel vérifié : `features/conversation/ui/SwipeableConversationCard.tsx:121-122` = `borderTopRightRadius` + `borderBottomRightRadius` (props physiques). Aucun `…EndRadius`/`writingDirection`. Viole le gotcha RTL CLAUDE.md.
- CHECKBOX-FLIP : non, reste [ ].

### `audit-factory-coverage.mjs` orphan — VERDICT: STILL-OPEN
- État réel vérifié : `scripts/sentinels/audit-factory-coverage.mjs` existe ; non câblé dans `.husky/`, `.github/`, ni `package.json` (root/BE). Orphan confirmé (delete OR wire).
- CHECKBOX-FLIP : non, reste [ ].

### `metric-naming.mjs` duplicate root vs museum-backend — VERDICT: STILL-OPEN
- État réel vérifié : 2 fichiers divergents — `scripts/sentinels/metric-naming.mjs` (8235 B) ≠ `museum-backend/scripts/sentinels/metric-naming.mjs` (6182 B). Invoqués séparément (root + BE package.json). CI mirror appelle seulement la version root.
- CHECKBOX-FLIP : non, reste [ ].

### `workspace-links.mjs` not in CI mirror — VERDICT: STILL-OPEN
- État réel vérifié : `scripts/sentinels/workspace-links.mjs` existe ; `grep -rln "workspace-links" .github/` = **0**. Seulement local (package.json + husky). Trou anti-bypass UFR-020.
- CHECKBOX-FLIP : non, reste [ ].

### `reportUnusedDisableDirectives` set BE/FE/Web — VERDICT: STILL-OPEN
- État réel vérifié : seul hit = FE `eslint.config.mjs:203` `reportUnusedDisableDirectives: 'off'` (override Jest-hoisting, pas un set global ON). Aucun set ON global dans les 3 configs (BE `eslint.config.mjs`, Web `eslint.config.mjs`). Item demande de le SET (ON) → non fait.
- CHECKBOX-FLIP : non, reste [ ].

### `AUDIT_AUTH_LOGIN_FAILED` raw email metadata — VERDICT: DONE-UNCHECKED
- État réel vérifié : `museum-backend/src/modules/auth/adapters/primary/http/helpers/login-handler.helpers.ts:60-66` — calcule `emailDomain = extractEmailDomain(email)` puis `metadata: { emailDomain }` (PAS l'email brut). Commentaire explicite "GDPR Art. 5(1)(c): never write the raw email into audit metadata — only the domain". Shippé par PR #294 (`71f103b35`, feat p0-gdpr).
- CHECKBOX-FLIP : **oui → cocher [x]** — email brut retiré de la metadata (domain-only), exactement la remédiation demandée.

### `EXPORT_PSEUDONYM_SALT` mandatory in prod — VERDICT: DONE-UNCHECKED
- État réel vérifié : `museum-backend/src/config/env.production-validation.ts:170-171` = `required('EXPORT_PSEUDONYM_SALT', …)` + `assertSecretLength(…)` (≥32 chars). `validateProductionEnv(env)` appelé au boot (`env.ts:537`) → fail-fast prod. Aucun fallback hardcodé restant dans `pseudonym.ts`. Shippé par PR #293 (`e0aade002`, I-SEC5). La prémisse de l'item ("currently optional with hardcoded fallback") est désormais FAUSSE.
- CHECKBOX-FLIP : **oui → cocher [x]** — fail-fast prod implémenté.

### Admin `DeleteUserUseCase` hard-delete — VERDICT: STILL-OPEN
- État réel vérifié : `museum-backend/src/modules/admin/useCase/users/deleteUser.useCase.ts:49` = `await this.repository.softDeleteUser(input.userId)`. Toujours soft-delete. Path admin Art.17 incomplet.
- CHECKBOX-FLIP : non, reste [ ].

### `AUDIT_ACCOUNT_DELETED` log AFTER cleanup — VERDICT: STILL-OPEN
- État réel vérifié : `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-profile.route.ts:151-152` `auditService.log({ action: AUDIT_ACCOUNT_DELETED })` AVANT `:160 await deleteAccountUseCase.execute(user.id)`. Ordering inversé (log avant cleanup) → log fantôme possible si delete throw.
- CHECKBOX-FLIP : non, reste [ ].

### `promtail-config.yml` PII redaction stages — VERDICT: STILL-OPEN
- État réel vérifié : `museum-backend/deploy/promtail-config.yml:19-28` — `pipeline_stages` = `json` (extract level/service/environment) + `labels` uniquement. AUCUN stage `replace`/regex de redaction PII. Zéro defense-in-depth.
- CHECKBOX-FLIP : non, reste [ ].

### `shouldDropBreadcrumb` + verify-email/magic-link/confirm-email-change paths + scrubUrl — VERDICT: PARTIAL
- État réel vérifié : `scrubUrl on breadcrumb.data.url` = **DONE** (`packages/musaium-shared/src/observability/sentry-scrubber.ts:171 out.url = scrubUrl(out.url)`). MAIS `SENSITIVE_BREADCRUMB_PATHS` (`:44-49`) = seulement `/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/change-password` — N'inclut PAS `verify-email`, `magic-link`, `confirm-email-change`. La R1 (L24, "extended 7→11") porte sur `SENSITIVE_QUERY_KEYS` (query-param scrub, `:29-41`), une liste différente, qui couvre `code`/`state`/`email`/`phone` pour magic-link — mais pas l'ajout des 3 paths au DROP-list breadcrumb.
- CHECKBOX-FLIP : non, reste [ ] — la moitié paths-DROP n'est pas faite. Note : la sous-tâche `scrubUrl` est de fait close (effet de bord R1), mais l'item composite reste ouvert sur les 3 paths.

---

## SECTION 3 — C — Cluster items NOW résiduels (L305-312)

### C1.1 Dashboard Grafana p50/p95/p99 per-stage STT/LLM/TTS — VERDICT: DONE-UNCHECKED
- État réel vérifié : `infra/grafana/dashboards/chat-stages-latency.json` = panels complets par phase : "Chat Stages Latency (per-phase p50/p95/p99)", STT/LLM/TTS p50/p95/p99 dédiés, LLM p95 per-provider, aggregate, phase error rate (16× `histogram_quantile`). Métrique backée = Prom `chat_phase_duration_seconds` (Histogram `prometheus-metrics.ts:53-54`, observé `chat-phase-timer.ts:98` labels `{phase, provider}` stt/llm/tts). Ajouté par `f6335fe52` (W4) — jamais coché.
- CHECKBOX-FLIP : **oui → cocher [x]** — per-stage panels shippés. Note : backend = Prometheus (`chat_phase_duration_seconds`), PAS Langfuse comme l'item spéculait ; mais l'exigence (p50/p95/p99 per-stage STT/LLM/TTS) est satisfaite. Mettre à jour le wording "Langfuse-backed" → "Prometheus-backed".

### C1.3 Optim data-driven — VERDICT: STILL-OPEN
- État réel vérifié : dépend de baseline C1.1 ≥7j bake. C1.1 dashboard prêt mais le bake/optim n'est pas une action code faite. Reste séquencé après.
- CHECKBOX-FLIP : non, reste [ ].

### C4.2 Threshold confidence tuning (LLM judge V2) — VERDICT: STILL-OPEN
- État réel vérifié : calibration sur dataset prod réel (V1.1), data-driven hors-code à ce stade.
- CHECKBOX-FLIP : non, reste [ ].

### C8.1-C8.6 VDP/CRA — VERDICT: STILL-OPEN (NEEDS-OPS-HUMAN)
- État réel vérifié : process + légal + actions Tim (security@ mailbox, CNIL dry-run, ENISA SRP, CERT-FR, PGP key, renewal calendar). Majoritairement hors-code.
- CHECKBOX-FLIP : non, reste [ ].

### C9.8 Activate Presidio adapter — VERDICT: STILL-OPEN (deferred by-design)
- État réel vérifié : `museum-backend/docker-compose.presidio.yml` (overlay sidecar) existe — la prémisse "manque … docker-compose" est partiellement obsolète (l'overlay a été ajouté 2026-05-16 avant le sweep, `presidio.adapter.ts` câblé conditionnel). MAIS la roadmap DÉCIDE explicitement "Pas P0 V1 … V1.1 OR V1 si pivot scale". L'activation prod (sidecar boot dans la stack par défaut + bascule env) n'est pas faite, et c'est voulu.
- CHECKBOX-FLIP : non, reste [ ] — deferred V1.1 par décision produit. Note : préciser dans le wording que l'overlay compose existe déjà ; le résiduel = activation (non Dockerfile/compose absents).

### C9.18 deep-link artworkId — VERDICT: STILL-OPEN (TD-NEW V1.1)
- État réel vérifié : fallback `/museum-detail` shippé ; route canonique `/museum/[id]/artwork/[artworkId]` = dette V1.1 déclarée.
- CHECKBOX-FLIP : non, reste [ ].

---

## Synthèse comptage

**Total items tranchés : 30** (16 V1.0.x + 14 small/cluster où "cluster" inclut C1.1/C1.3/C4.2/C8/C9.8/C9.18 — note: C7.5/C8/W2.2 = ops/doc/cross-ref).

- **DONE-UNCHECKED (à cocher [x]) : 6**
  1. C10 race expo-speech/server TTS (`useChatSession.ts:123-155`, I-CMP3, `e62b93f75`)
  2. C10 Switch accessibilityLabel (`SettingsAccessibilityCard.tsx:36-38`, `e62b93f75`)
  3. C10 5 WCAG audio-path violations (I-CMP3 5/5, `e62b93f75`)
  4. AUDIT_AUTH_LOGIN_FAILED raw email (`login-handler.helpers.ts:60-66`, PR #294)
  5. EXPORT_PSEUDONYM_SALT mandatory prod (`env.production-validation.ts:170-171`, PR #293 I-SEC5)
  6. C1.1 Grafana per-stage panels (`chat-stages-latency.json` + `chat_phase_duration_seconds`, `f6335fe52`)

- **PARTIAL : 1** — shouldDropBreadcrumb (scrubUrl done, 3 paths manquants → reste [ ])

- **STILL-OPEN : 23** — C3.5, C3.7, C6.5(doc), C7.5(ops), C10-ChooseAnother, C10-FE→BE-write, Accept-Language, Maestro-audio, Maestro-3flows, reviews.userName, TTS-cache-mp3, W2.2(doc), SUPPORTED_LOCALES, hashEmail, Brevo-unsub, SwipeableCard-RTL, audit-factory-orphan, metric-naming-dup, workspace-links-CI, reportUnusedDisableDirectives, DeleteUser-hard, AUDIT_ACCOUNT_DELETED-order, promtail-PII, C1.3, C4.2, C8.x(ops), C9.8(deferred), C9.18.

> NB UFR-013 : majorité OPEN = comportement attendu (hotfix window). Les 6 DONE-UNCHECKED proviennent de commits postérieurs à la dernière mise à jour roadmap (PR #293/#294 sécurité + #298 a11y + W4 dashboard `f6335fe52`) que la roadmap n'a pas re-cochés.
