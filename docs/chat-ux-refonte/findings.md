# Chat Musaium — Findings & Scope

**Date** : 2026-05-14
**Worktree** : `.claude/worktrees/feat+chat-ux-refonte/`
**Branch** : `worktree-feat+chat-ux-refonte`
**Base** : `origin/main` @ `9dfd3178` (clean fork, autre agent travaille sur main)
**Source** : audit multi-agents (5 sub-agents en parallèle, run du 2026-05-14)

---

## 1. Executive summary

Le module chat Musaium n'est pas un MVP fragile : il est déjà très avancé (FlashList virtualisée, streaming throttle 30ms côté FE, LlmCacheServiceImpl 3 classes côté BE, EU AI Act Art.50 disclosure, 124+ a11y labels, offline queue). La refonte ne réécrit pas l'architecture — elle :

1. **Comble des gaps UX 2026** (status typés, citation chips, hero card pinned, "ask more" inline, sotto-voce mode) — table-stakes 2026 absents.
2. **Ajoute des différenciateurs** (carnet de visite post-visite, conversation resumption, QR cartel fallback, free-form voice proactive) — patterns absents chez les concurrents museum mobile.
3. **Améliore la perf perçue** (cache LLM élargi scans œuvres, modal soup cleanup) sans rallumer le streaming SSE (décision utilisateur 2026-05-14 — rester sync, accélérer ailleurs).

C5 expo-image-manipulator migration : **out of scope** ce chantier, traité par autre agent sur `main`.

---

## 2. État actuel du chat (consolidé)

### 2.1 Frontend (`museum-frontend/features/chat/`)

**Architecture** : domain-driven + stratégie dispatch.
- 4 stratégies d'envoi : `cache` / `offline` / `audio` / `streaming` via `pickSendStrategy`
- Zustand store (`chatSessionStore.ts`) + persistence
- Hooks orchestrateurs : `useChatSession`, `useChatSessionActions`, `useChatSessionInputHandlers`, `useChatSessionIntents`

**UI clés** :
| Path | Rôle |
|---|---|
| `ui/ChatMessageList.tsx` | FlashList virtualisée, recycler typé (user/assistant), scroll backup `setInterval` 350ms |
| `ui/ChatMessageBubble.tsx` | React.memo + comparateur streaming-aware |
| `ui/bubbleSections/StreamingBody.tsx` | Cursor blink Animated (useNativeDriver: true) |
| `ui/ChatInput.tsx` | TextInput + image thumb |
| `ui/MediaAttachmentPanel.tsx` | Audio preview + mic/gallery/lens buttons |
| `ui/VoiceSessionIntro.tsx` | Modal EU AI Act Art.50, expo-speech lazy-loaded |
| `ui/ChatSessionModals.tsx` | **6 modals empilés** : browser / context menu / consent / summary / daily-limit / voice-intro |
| `ui/ImageCarousel.tsx`, `ui/ImageFullscreenModal.tsx`, `ui/ArtworkCard.tsx` | Image flow |
| `ui/WalkSuggestionChips.tsx` | Suggestions horizontales mode balade |

**Voice pipeline** :
- `application/useAudioRecorder.ts` : expo-audio (native) + MediaRecorder (web)
- `application/useTextToSpeech.ts` : fetch MP3 → cache disque (`<cacheDir>/tts/<msgId>.mp3`)
- `application/useAutoTts.ts` : auto-play sur nouveau message assistant (skip si low-data)
- `hooks/useVoiceDisclosure.ts` : gate Article 50 par session

**Image upload** :
- `application/imageUploadOptimization.ts` : resize 1600px + JPEG progressif itératif, target 2.7MB (5 quality steps `[0.82 → 0.42]`)
- `application/useImageManipulation.ts` : **expo-image-manipulator déprécié** (eslint-disable en place) — migration C5 par autre agent

**Conformité** :
- Tokens design system utilisés partout (`semantic.*`, `space.*`, `surfaceColors.*`)
- Ionicons + PNG require — pas d'unicode emoji
- 124+ `accessibilityLabel/Role/Hint`
- `useReducedMotion()` respecté (WCAG 2.3.3)
- i18n FR/EN via `useTranslation()`

### 2.2 Backend (`museum-backend/src/modules/chat/`)

**Architecture hexagonale** : domain → useCase → adapters.
- Routes : `chat-message.route.ts` (POST messages, sync), `chat-media.route.ts` (audio STT+LLM)
- Use-case : `chat.service.ts` (façade), `chat-message.service.ts:270` (postMessage), `prepare-message.pipeline.ts:153`
- Adapters LLM : `langchain.orchestrator.ts` multi-provider (OpenAI / Google / Deepseek)
- Adapter TTS : `text-to-speech.openai.ts:93` (gpt-4o-mini-tts → MP3 → S3)

**Pipeline timing (P50 / P99 sans TTS)** :
| Étape | Latence | Bloquant |
|---|---|---|
| Validation + session check | ~10ms | ✓ |
| Image processing (EXIF strip, si image) | 50-200ms | ✓ |
| Guardrail input (keyword + optional LLM judge F4) | 10-50ms | ✓ |
| User message persistence | 20-30ms | ✓ |
| Enrichment parallèle (KB + web + image-enrichment) | 100-800ms | ✗ |
| Location resolution (Nominatim) | 100-500ms | ✓ |
| LLM cache lookup | 1-10ms | ✓ |
| **LLM call** | **2000-6000ms** | ✓ |
| Guardrail output | 10-100ms | ✓ |
| Cache store + response persistence | 20-40ms | ✓ |
| TTS optionnel (gpt-4o-mini-tts + S3 upload) | 1000-2000ms | ✗ |

**P50 ~2.5s / P99 ~5.5s sans TTS. +1.5s avec TTS.** LLM call = dominant.

**Cache LLM** (ADR-036, `LlmCacheServiceImpl`) :
- Key : `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256(canonical)}`
- 3 classes : `personalized` (TTL 1h) / `museum-mode` (TTL 24h) / `generic` (TTL 7d)
- **Bypass total dès qu'image présente** (`chat-message.service.ts:319`) — ⚠️ optimisable (cf. C3 scope)
- Metrics : `llm_cache_hits_total{context_class}`, `llm_cache_misses_total{context_class}` (Prometheus)

**Streaming** : **DEPRECATED** (ADR-001 supprimée 2026-05-03). Code dormant à `chat-message.sse-dormant.ts`. Mobile reçoit full message synchrone (JSON 201). Décision 2026-05-14 : **rester sync, accélérer ailleurs**.

**Quotas/Rate limit** (4 layers) :
- Daily chat limit per-user (Redis + InMemoryBucketStore fallback)
- Per-session sliding window
- Per-user sliding window (SEC-20 2026-04-08, anti-multiplication bypass)
- LLM cost guard per-user daily USD cap (P0-4 audit 2026-05-12)

**Observability** : Prometheus (chat_phase_duration_seconds, chat_phase_errors_total, chat_request_duration_seconds, llm_cache_hits/misses) + Langfuse spans (TTS, enrichment per-source, KB) + Sentry per-section spans + structured logs (info/warn fail-open).

---

## 3. Benchmark — synthèse multi-source

### 3.1 Best-in-class AI chat mobile 2025-2026

Apps benchmarkées : ChatGPT, Claude, Pi.ai, Perplexity, Le Chat (Mistral), Gemini Live, Microsoft Copilot, Meta AI, Grok.

**Patterns à STEAL (validés par ≥2 sources)** :
1. **Unified voice+text surface** (ChatGPT nov 2025) — fini le blue-orb plein écran qui isole. Voix vit *dans* le thread, contexte visuel toujours visible.
2. **Camera-in-conversation live commentary** (Gemini Live, Project Astra) — caméra ouverte, IA commente en streaming. Killer feature museum potential (V2 pour Musaium).
3. **Citation cards style Perplexity** — chaque claim factuel ancré par une source visible.
4. **OS-level voice shortcut** (Perplexity iOS Action Button / Android swipe corner).
5. **Conversation resumption explicite** (Pi.ai "walking back into a conversation").
6. **Ambient near-invisible UI** (Microsoft Copilot mobile-first redesign 2026).
7. **Visual confidence/provenance indicators** (Smashing Magazine 2026 pattern).

**Anti-patterns à éviter (explicitement)** :
- Blue-orb full-screen voice (déprécié ChatGPT nov 2025 lui-même)
- Generic 3 follow-up chips ("Tell me more / Summarize / Another") — `ShapeOfAI` flagué anti-pattern + doctrine Musaium `project_hybrid_product_philosophy`
- Pulsing avatar circle "How can I help?" (Pi.ai et Le Chat l'ont abandonné)
- Full-page modal pour la voix
- Boring markdown-heavy bubbles (tue le moment poétique d'une œuvre)
- AI rainbow gradient flashy ([Creative Boom 2026 tired list](https://www.creativeboom.com/insight/10-trends-creatives-are-so-over-in-2026/))

### 3.2 Tendances UX/UI 2026

- **Voice as first-class** dans la barre d'action principale, jamais derrière menu
- **Push-to-talk default in-museum**, hands-free toggle quiet zone (Claude voice docs recommend)
- **Barge-in** (interrompre l'IA en parlant) = table-stakes 2026 (LiveKit adaptive interruption, Orga.ai)
- **Status typés contextuels** : `Searching the collection…`, `Looking at the artwork…`, `Synthesizing voice…` — remplace `…` générique
- **Glassmorphism dark base** (Apple Liquid Glass mainstreamed 2025, [Medium dark glassmorphism 2026](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f))
- **Skeleton shimmer** + **token streaming typewriter** : -40% perceived load (Groovy Web — directional, pas peer-reviewed)
- **Variable typo trending** (Inter, SF Pro standards) — éviter kinetic flashy
- **Dark mode default** pour AI apps (~82% préférence per Groovy Web — directional)

### 3.3 Museum + image-AI apps

Apps benchmarkées : Smartify, Bloomberg Connects, Google Arts & Culture, Cooper Hewitt Pen, Cleveland ArtLens, Rijksmuseum, Louvre, MoMA, Be My AI, Google Lens, Apple Visual Look Up, ChatGPT mobile, Snap AR.

**Patterns convergents** :
1. **Be My AI continuité capture→conversation sans modal** — pattern le plus proche du flow Musaium ; étude académique montre moyenne 3 turns / jusqu'à 21 en multi-turn.
2. **Cooper Hewitt trace post-visite** : 30% retour post-visite consulter sa collection web → différenciateur fort sous-exploité en mobile.
3. **Bloomberg Connects lookup number cartel** = QR/code manuel, robuste fallback quand scan visuel échoue (low-light, vitrines réfléchissantes).
4. **Rijksmuseum routes depuis favoris** — pattern mature : swipe collection soir → app calcule itinéraire optimal lendemain.
5. **Transcript sync mot-par-mot pendant TTS** : explicitement demandé par reviews Louvre app 2024-2025 ("pause audio = read along").
6. **VoiceOver + captions + font scale + image zoom = baseline accessibilité**, pas option avancée (MoMA, Bloomberg Connects).

**Gap UX museum réel non adressé par la concurrence** :
- Sotto-voce mode (low-energy public space, audio muet + transcript live)
- Free-form voice sans capture (proactive géoloc : "à quoi ressemble la salle suivante ?")

**À éviter (coût/risque)** :
- iBeacon investment (Cleveland 240 unités, Rijksmuseum 300) — inacceptable B2B pre-revenue Musaium
- Indoor positioning Apple/Google (Louvre app reviews 2024-2025 : reviews négatives sur GPS in-building)

---

## 4. Pain points identifiés (code-side)

| ID | Pain | Source | Impact | Tier |
|---|---|---|---|---|
| P1 | Streaming SSE désactivé (ADR-001) → mobile sync full-message | `chat-message.route.ts:206-216` | P50 ~2.5s wait | **out-of-scope** (décision user) |
| P2 | P50 2.5s / P99 5.5s sans TTS, +1.5s avec TTS | Pipeline timing | UX wait perçu | mitigé via C3 cache + A5 status typés |
| P3 | Modal soup (6 modals empilés) | `ChatSessionModals.tsx:42-67` | Maintenance + bugs | **C4** |
| P4 | Streaming state mgmt complexe (refs + timers + cleanup race) | `useStreamingState.ts:18-20` | Bugs subtils | hors scope (streaming inactif) |
| P5 | Cache LLM bypass total dès image présente | `chat-message.service.ts:319` | LLM cost + latence répétée | **C3** |
| P6 | expo-image-manipulator déprécié | `useImageManipulation.ts:1` | Risque next SDK | **autre agent (main)** |
| P7 | Pas de transcript sync mot-par-mot pendant TTS | absent du code | Gap WCAG + UX museum | **out-of-scope V1** (Tier 3) |
| P8 | Generic `...` typing indicator | `StreamingBody.tsx` cursor seul | Trend 2026 manqué | **A5** |
| P9 | `MediaAttachmentPanel` toujours visible (mange écran) | `ui/MediaAttachmentPanel.tsx` | Chrome > œuvre | **A1** |
| P10 | Pas de hero artwork card pinned pendant conversation | absent | Œuvre perdue au scroll | **A2** |
| P11 | Pas de signal confiance/source sur claims AI | absent | UFR-013 doctrine pas surfacée UI | **A6** |
| P12 | Pas de "Ask more" inline | absent | Pattern Be My AI manqué | **B3** |
| P13 | Pas de conversation resumption | session frag absent | Pattern Pi.ai manqué | **B2** |
| P14 | Pas de carnet visite post-visite | absent | Différenciateur Cooper Hewitt manqué | **B1** |
| P15 | Pas de fallback QR cartel | absent | Low-light failure path | **B4** |
| P16 | Pas de sotto-voce mode | absent | Museum context gap | **B5** |
| P17 | Pas de voice proactive géoloc | absent | LocationResolver in-museum sous-exploité | **B6** |
| P18 | Bubbles user/assistant indistinguées par texture | tokens uniformes | Glassmorphism 2026 trend | **A3** |
| P19 | Top bar non-collapsible au scroll | absent | Chrome statique | **A4** |

---

## 5. Scope final (décidé 2026-05-14)

**Inclus** : Tier 1 complet + Tier 2 complet + B6 + C3.
**Exclus** : C1 streaming SSE revival, C2 TTS streaming first-byte, B7 transcript sync, C5 expo-image-manipulator (autre agent), V2 Camera live commentary, V2 voice barge-in.

**14 features à shipper** :

| ID | Feature | Tier |
|---|---|---|
| A1 | Unified composer (mic+text+slide-up media sheet) | 2 |
| A2 | Artwork hero card pinned (collapsible) | 1 |
| A3 | Bubbles différenciées (user mat, assistant glassmorphism) | 2 |
| A4 | Top bar collapsible au scroll | 2 |
| A5 | Status typés (5 strings contextuels) | 1 |
| A6 | Citation chips (source/confidence badges) | 1 |
| B1 | Carnet de visite post-visite | 2 |
| B2 | Conversation resumption banner | 2 |
| B3 | "Ask more" inline (1 follow-up contextuel, jamais 3) | 1 |
| B4 | QR cartel fallback | 2 |
| B5 | Sotto-voce mode toggle | 1 |
| B6 | Free-form voice proactive géoloc | 3 (promu) |
| C3 | Cache LLM élargi scans œuvres répétitifs | 3 (promu) |
| C4 | Modal soup cleanup → BottomSheetRouter | 1 |

État détaillé feature-par-feature dans [tracking.md](tracking.md).

---

## 6. Anti-scope — ce qu'on NE fait PAS

- ❌ **Streaming SSE revival** — user choice 2026-05-14 (rester sync).
- ❌ **Multi-image upload user** — déjà rejeté 2026-05-08 (memory `project_c2_ai_side_only`).
- ❌ **iBeacon B2B push** — coût inacceptable pre-revenue.
- ❌ **Generic 3 follow-up chips** — doctrine `project_hybrid_product_philosophy`.
- ❌ **Feature flags `*_ENABLED`** — interdit pre-launch (`feedback_no_feature_flags_prelaunch`).
- ❌ **Refonte voice pipeline core** — pipeline STT/LLM/TTS reste tel que.
- ❌ **AI rainbow gradient flashy** — anti-trend 2026.
- ❌ **Unicode emoji dans screens/copy** — `feedback_no_unicode_emoji`.

---

## 7. Honnêteté UFR-013 — caveats sur ce report

Plusieurs claims du benchmark viennent de blogs design-trend single-source, pas peer-reviewed :
- "82% prefer dark mode", "40% perceived-load reduction", "55-70% wait reduction" — directional only (Groovy Web)
- "Cooper Hewitt 30% retour post-visite" — case study Local Projects, pas étude indépendante
- "Pi.ai breathing animation exact cycle" — non vérifié source officielle
- "Anthropic offline voice packs Q1 2026" — mentionné par tier blog, non confirmé par Anthropic
- "Apple HIG voice section + Material Design 3 voice patterns" — pages canoniques non fetchées dans ce passage de recherche

Plusieurs museum apps benchmarkées n'ont pas été testées hands-on (Smartify in-situ, Cooper Hewitt Pen, Louvre app sur place, Cleveland ArtLens) — patterns reconstitués depuis App Store pages + case studies + reviews. Décisions de design devraient être confirmées via hands-on testing avant V1 launch.

---

## 8. Source agents (traçabilité)

Run 2026-05-14, 5 agents en parallèle :
1. Explore FE chat module — output consolidé §2.1
2. Explore BE chat + voice pipeline — output consolidé §2.2 + §4
3. general-purpose : best-in-class AI chat 2026 — output consolidé §3.1
4. general-purpose : UX/UI trends 2026 conversational AI — output consolidé §3.2
5. general-purpose : museum + image-AI apps — output consolidé §3.3

Pas d'agent ID public exposé ici (process-internal traceability via Langfuse spans run-level).
