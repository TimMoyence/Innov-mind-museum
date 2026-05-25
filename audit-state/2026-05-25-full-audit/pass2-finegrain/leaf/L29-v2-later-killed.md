# L29 — Audit V2 NEXT / LATER / KILLED (sanity deferred)

- **Branch/HEAD** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af` (confirmé `git rev-parse`).
- **Mode** : READ-ONLY fresh-context (UFR-022). Aucun marqueur cru, tout re-dérivé par grep/ls/Read.
- **Périmètre** : ROADMAP_PRODUCT.md lignes ~380-481 (NEXT V2 Walk, LATER F/M1-M3, KILLED table).
- **Conclusion globale** : V2 Walk **réellement absent** du code. Aucun item LATER/KILLED secrètement présent. Une seule correction de classification mineure (M1.3 — voir §B). Fondations pré-existantes (S3 adapter, F3 backups) correctement reflétées par la roadmap.

---

## A) NEXT V2 — Walk hors-musée (lignes ~380-398)

NorthStar affirme « V2 = absent en V1 ». **VÉRIFIÉ : confirmé absent.**

| Item roadmap | Verdict | Preuve |
|---|---|---|
| `features/walk/` création (~700 LOC FE) | **ABSENT** ✅ | `ls museum-frontend/features/ \| grep -i walk` → vide. `find … -type d -iname '*walk*'` → uniquement `node_modules/` (estree-walker, acorn-walk, css-tree/walker — libs tierces, zéro code app). |
| 3-4 migrations `museum_pois`/`walk_routes`/`walk_progress`/`tour_step_audio_cache` | **ABSENT** ✅ | `ls museum-backend/src/data/db/migrations/ \| grep -iE 'poi\|walk\|tour\|route'` → vide. |
| BE module `walk` (directions OSRM + circuit breaker + audio sidecar) | **ABSENT** ✅ | `ls museum-backend/src/modules/ \| grep -iE 'walk\|poi\|tour\|direction\|route'` → vide. `grep -rln "OSRM\|directions\|polyline\|getRoute" src/` → vide. |
| TTS audio streaming refonte (port returns `Readable` not `Buffer`) | **ABSENT — NON commencé** ✅ | `tts.port.ts:5` → `audio: Buffer;` ; `:19-25` → `synthesize(…): Promise<TtsResult>`. Toujours Buffer, pas de Readable/chunked. Aucun `Readable` dans `modules/chat/`. |
| MapLibre polyline `<LineLayer>` + `<ShapeSource>` | **ABSENT** ✅ | `grep -rn "LineLayer\|ShapeSource" museum-frontend/ --include=*.tsx --include=*.ts` (hors node_modules/.test-dist) → 0 hit. |
| Pause-resume `expo-av` queue + AsyncStorage position | **ABSENT** ✅ | Pas de feature walk; queue audio pause-resume inexistante. |
| Background GPS `expo-task-manager` + `requestBackgroundPermissionsAsync` | **ABSENT — pas même la dép** ✅ | `expo-task-manager` **PAS** dans `package.json`. Aucun `TaskManager`/`startLocationUpdatesAsync` dans `app/features/shared/components` (seuls hits = `ios/Pods/` + `build/*.xcarchive` artefacts vendor/build, hors code app). |
| 5 ADRs requis (audio model, directions provider, POI source, state machine, GPS) | **ABSENT** (non vérifié exhaustivement docs/adr mais aucun code dérivé) ✅ | Cohérent : aucune impl. |

### Note fondation pré-existante (legit, pas du walk secret)
- `app.config.ts:178` déclare `UIBackgroundModes: ['audio']` — **conforme** au claim roadmap « background audio mode déjà partially declared via UIBackgroundModes:audio ». C'est pour la lecture TTS chat V1 (commentaire `:173` « required for TTS playback to continue »), PAS du walk background-audio. Pas de fondation walk cachée.

**Verdict A : V2 Walk = ZÉRO code. Correctement déféré. Aucune fondation walk secrète.**

---

## B) LATER — Infra VPS + M1-M3 (lignes ~402-446)

| Item | Verdict | Preuve |
|---|---|---|
| **F3 DB backups off-VPS** (marqué `[x]` SHIPPÉ) | **CONFIRMÉ SHIPPED** ✅ (marqueur correct) | `.github/workflows/db-backup-daily.yml` + `db-backup-monthly-restore-drill.yml` existent. Le `[x]` est exact. |
| **F2 Photos S3/B2** (roadmap : « adapter S3 déjà prêt + tests existent ») | **Fondation CONFIRMÉE présente** (item reste `[ ]` — work = IaC offload, pas l'adapter) | Adapter S3 existe : `modules/chat/adapters/secondary/storage/audio-storage.s3.ts`, `image-storage.s3.ts`, `s3-operations.ts`, `s3-signing.ts`, ports `image-storage.port.ts`/`audio-storage.port.ts`, jobs `s3-orphan-purge*`. Claim roadmap honnête — l'adapter EST prêt. Pas de over-claim. |
| **F5 container resource limits docker-compose.prod** | **NON fait** ✅ | Fichier prod = `museum-backend/deploy/docker-compose.prod.yml` (pas racine). `grep limits/mem_limit/cpus/deploy:` → vide. Correctement `[ ]`. |
| M1.1 Curator-overrideable LLM (override-pack JSON) | **ABSENT** ✅ | `grep -rln "override-pack\|curatorOverride\|curator_override"` → vide. |
| M1.3 White-label / co-branding consumer FE (`config.branding`) | **ABSENT côté consumer FE** ✅ — voir nuance | Admin branding **page web existe** (`museum-web/.../admin/museums/[id]/branding/page.tsx`) MAIS c'est du P0.C8 pré-existant, PAS le M1.3 mobile consumer. `museum-frontend/shared/ui/BrandMark.tsx` = logo Musaium **statique** (`require('.../logo.png')`, variants `auth/hero/header`), AUCUN `config.branding` dynamique musée. `grep "config.branding\|branding" museum-frontend/features` → vide. Le « + Mobile FE consumer for config.branding » de M1.3 n'est PAS commencé. |
| M1.4 AR pilot (ARKit/ARCore/Viro) | **ABSENT** ✅ | `grep -rln "ARKit\|ARCore\|expo-gl\|viro\|react-native-ar"` dans app/features → 0 (hits sur `runtimeSettings.ts`/`privacyPolicyContent.ts` = substring « ar » dans autre mot, faux positif). |
| M1.5 Sign Language LSF/BSL overlay | **ABSENT** ✅ | `grep "LSF\|signLanguage\|BSL"` → seuls hits = `package-lock.json` + `build/*CodeResources` (faux positifs binaires). |
| M1.6 Voice pack ElevenLabs / M2.x (Contextual Retrieval, GraphRAG, Jina-CLIP, gpt-realtime-mini, Exa/Linkup) | **ABSENT** ✅ | `grep "ContextualRetrieval\|GraphRAG\|jina-clip\|ElevenLabs.*Iconic\|voicePack"` → 0 hit. |
| M3.1-M3.7 moonshots (3DGS, co-presence, gen remix, affective, haptic wayfinding, prosody, visit-graph) | **ABSENT** ✅ | `grep "3DGS\|gaussian-splat\|co-presence\|affective\|prosody\|emotion-adaptive\|wayfinding\|watchkit\|WatchConnectivity"` → 0 hit app. M3.5 « haptic » faux positifs = `expo-haptics` générique (`ChatInput.tsx:3` `import * as Haptics` pour feedback bouton — PAS du wayfinding Apple Watch). |

**Verdict B : Aucun M secrètement commencé. F3 correctement `[x]`. Fondation F2 (S3 adapter) honnêtement reflétée. Seule nuance : M1.3 admin-branding web pré-existe mais c'est P0.C8, le M1.3 *consumer-FE* reste bien à faire — la roadmap ne sur-claime pas (item `[ ]`).**

---

## C) KILLED — confirmer aucune ré-introduction (lignes ~456-469)

| Item killed | Verdict | Preuve |
|---|---|---|
| **SSE streaming chat** (BE déprécié, FE burial P0.D1) | **KILLED — non ré-introduit, vestiges = morts documentés** ✅ | `send.ts:158-170` : `sendMessageSmart` = `always synchronous`, callbacks `onToken/onDone/onGuardrail/signal` **intentionnellement ignorés**, « dormant SSE streaming path was buried (D1) ». `sendMessageStreaming.ts:116-127` : tombe sur le « Non-streaming fallback … BE today returns sync (SSE deprecated), this is the live path ». Le naming « streaming » est vestigial. `app.ts:166` = garde défensive (`accept === 'text/event-stream'` → skip, pas un endpoint SSE). Hits web (Spinner/BaseModal/AlertBanner…) = faux positifs substring « SSE ». **Transport live = sync `postMessage` uniquement.** |
| **Garak orchestrator** | **KILLED — workflow supprimé** ✅ | `ls .github/workflows/ \| grep garak` → vide. Seul résidu = `.claude/skills/team/team-state/2026-05-14-garak-musaium-rest-swap/` (artefact /team historique, pas du code/CI live). Cohérent avec CLAUDE.md (`llm-security-garak.yml` supprimé 2026-05-17). |
| **Realtime API V1 walk-mode** (gpt-realtime / WebRTC) | **KILLED — absent** ✅ | `grep "gpt-realtime\|RealtimeSession\|webrtc\|openai/realtime"` dans BE src + FE features/shared → 0 hit. (WebRTC realtime aussi noté « reporté V1.1 » dans CLAUDE.md §Voice V1.) |
| **Voice clone DIY succession artists** (Picasso/Frida/Warhol) | **KILLED — absent** ✅ | `grep "Picasso.*voice\|voiceClone\|voice_clone\|ElevenLabs"` → 0 hit. |
| **Hexagonal POJO 23 entities V1** / **Chat éclatement 4 sous-modules V1** | **KILLED — non appliqué** ✅ | `museum-backend/src/modules/chat/` reste mono-module composition-root : `adapters/ chat-module.ts domain/ index.ts jobs/ useCase/`. Aucun éclatement en sous-modules walk/tour/etc. Cohérent avec CLAUDE.md (« 909 LOC composition root sain »). |
| Spec D recall / NL_LINKEDIN / PROD_10_10 / W6.5 44→22 | (docs/roadmap-only, pas de code attendu) | Non-code, hors scope vérif code. Pas de ré-intro code dérivée détectée. |

**Verdict C : AUCUN item KILLED ré-introduit. SSE = vestiges morts correctement documentés (burial D1 effectif). Garak = workflow CI supprimé. Realtime/voice-clone/POJO-split = jamais entrés.**

---

## Honnêteté / limites

- Vérif basée sur grep/ls/Read ciblés (faux positifs node_modules/coverage/build/Pods écartés explicitement).
- ADRs « 5 requis pour walk » non listés dans `docs/adr/` (non vérifié exhaustivement) — non pertinent puisque zéro code walk.
- F1/F4/F6 (disque dédié, split VPS, SLO) = infra OVH runtime, non vérifiables par code statique — marqués `[ ]`, cohérent.
- Pas de modif effectuée (READ-ONLY).
