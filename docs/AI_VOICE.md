# AI Voice — Architecture V1

> **Statut :** Production V1 (2026-04)
> **Spec source :** `docs/plans/reports/VOICE_V1_*.md` (mesures terrain), `.claude/skills/team/team-reports/2026-04-18-challenge-roadmap/`
> **ADR liés :** `docs/adr/ADR-001-sse-streaming-deprecated.md`

## TL;DR

Musaium V1 utilise un pipeline voice **classique** : un visiteur appuie sur le micro, parle, l'app renvoie une réponse en texte (persistée DB) **et** en audio MP3 (cachable S3, replay offline possible).

Pas de Realtime WebRTC en V1 — décision produit pour préserver : persistence, curation, indépendance vendor, offline. Realtime sera réévalué en V1.1 si la latence terrain de la pipeline classique dépasse les seuils acceptables.

## Pipeline complet

```
Mobile                 Backend                          OpenAI
──────                 ───────                          ──────
1. Tap mic
2. Record (expo-audio)
3. POST /sessions/:id/audio (multipart, base64) ─►
                       4. ChatMessageService.postAudioMessage
                          ├─ OpenAiAudioTranscriber.transcribe ──► gpt-4o-mini-transcribe
                          │   (= ce qu'on appelle "Whisper" — pas de clé séparée)
                          └─ Texte transcrit persisté en ChatMessage(role=user)
                       5. ChatService.postMessage (texte transcrit)
                          ├─ Guardrails (art-topic + advanced + PII)
                          ├─ LangChain orchestrator ─────────────► gpt-4o-mini (configurable)
                          └─ ChatMessage(role=assistant, text) persisté
            ◄────── 201 { sessionId, message: { id, text, ... }, transcription }
6. useAutoTts détecte nouveau message assistant
7. POST /sessions/:id/messages/:msgId/synthesize ─►
                       8. ChatMediaService.synthesizeSpeech
                          ├─ Cache Redis hit ? → retourne audio (chemin chaud, < 100ms)
                          ├─ Cache S3/DB hit (audioUrl + voice match) ? → futur, V1.1
                          └─ Fresh:
                             ├─ OpenAiTextToSpeechService.synthesize ─► gpt-4o-mini-tts
                             ├─ AudioStorage.save (S3 ou local) → audioUrl
                             ├─ ChatRepository.updateMessageAudio (audioUrl + generatedAt + voice)
                             └─ Redis set (audio base64)
            ◄────── 200 audio/mpeg buffer
9. expo-audio createAudioPlayer → playback
10. Cache local file system (J2 FE) → replay offline
```

## Composants

### Backend

| Composant | Localisation | Rôle |
|---|---|---|
| `OpenAiAudioTranscriber` | `museum-backend/src/modules/chat/adapters/secondary/audio-transcriber.openai.ts` | STT via `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`). |
| `LangChainChatOrchestrator` | `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | LLM multi-provider (openai/deepseek/google) via `env.llm.provider`. |
| `OpenAiTextToSpeechService` | `museum-backend/src/modules/chat/adapters/secondary/text-to-speech.openai.ts` | TTS via `gpt-4o-mini-tts` (env `TTS_MODEL`), voix `alloy` par défaut (env `TTS_VOICE`). |
| `AudioStorage` (port) | `museum-backend/src/modules/chat/domain/ports/audio-storage.port.ts` | Abstraction stockage audio. |
| `S3CompatibleAudioStorage` | `museum-backend/src/modules/chat/adapters/secondary/audio-storage.s3.ts` | Adapter S3 — préfixe `chat-audios/<year>/<month>/<uuid>.mp3`. |
| `LocalAudioStorage` | `museum-backend/src/modules/chat/adapters/secondary/audio-storage.stub.ts` | Adapter dev (`tmp/audios/`). |
| `ChatMediaService.synthesizeSpeech` | `museum-backend/src/modules/chat/useCase/chat-media.service.ts:188` | Cache Redis (TTL 1d) + persistance S3 + DB (audioUrl). |
| `ChatMediaService.getMessageAudioUrl` | `museum-backend/src/modules/chat/useCase/chat-media.service.ts` | Retourne URL signée S3 pour download direct mobile. |
| `ChatRepository.updateMessageAudio` | `museum-backend/src/modules/chat/domain/chat.repository.interface.ts` | Persiste `audioUrl/audioGeneratedAt/audioVoice` sur `ChatMessage`. |

### Frontend (mobile)

| Composant | Localisation | Rôle |
|---|---|---|
| `useAudioRecorder` | `museum-frontend/features/chat/application/useAudioRecorder.ts` | Capture micro (expo-audio native + MediaRecorder web). |
| `useTextToSpeech` | `museum-frontend/features/chat/application/useTextToSpeech.ts` | Fetch + playback TTS. **TODO J2** : cache local `expo-file-system`. |
| `useAutoTts` | `museum-frontend/features/chat/application/useAutoTts.ts` | Auto-play TTS sur nouveau message assistant. |
| `useOfflineAudio` | `museum-frontend/features/chat/application/useOfflineAudio.ts` (à créer J2) | Pre-fetch audio pour walks offline. |

### Schéma DB

`chat_messages` (migration `1776593841594-AddAudioToChatMessage`) :
- `audioUrl text NULL` — référence storage (`s3://...` ou `local-audio://...`)
- `audioGeneratedAt timestamp NULL` — date génération TTS
- `audioVoice varchar(32) NULL` — id voix utilisée

Toutes nullable, non-breaking pour les rows existants.

## Configuration env

```env
# LLM (existant)
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai                              # openai | deepseek | google
LLM_MODEL=gpt-4o-mini
LLM_AUDIO_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe   # STT (Whisper successor)

# TTS (V1)
TTS_MODEL=gpt-4o-mini-tts                        # Default V1 (était tts-1 avant)
TTS_VOICE=alloy                                  # alloy | echo | fable | onyx | nova | shimmer | verse | marin
TTS_SPEED=1.0
TTS_MAX_TEXT_LENGTH=4096
TTS_CACHE_TTL_SECONDS=86400                      # Redis cache hot path (1 jour)

# Storage S3 (audio + image partagent le même bucket, préfixes différents)
S3_ENDPOINT=https://s3.eu-west-3.amazonaws.com
S3_REGION=eu-west-3
S3_BUCKET=musaium-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_SIGNED_URL_TTL_SECONDS=900                    # URLs signées TTL 15min
```

## Sécurité / Guardrails

Le pipeline voice **hérite** des guardrails du chat texte :

- **Guardrail input** (`art-topic-guardrail.ts`) sur le texte transcrit avant LLM.
- **Advanced guardrail** (LLMGuard) sur le texte transcrit (PII, injection).
- **Guardrail output** sur la réponse LLM avant TTS.
- **System prompt isolation** : message ordering `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]` — rien d'utilisateur dans le system prompt.
- **Sanitization** : `sanitizePromptInput()` sur location/locale.

→ Pas de logique sécurité dédiée voice. La voix passe par le chemin texte sécurisé.

## Coût

| Étape | Tarif (avril 2026) | Pour 1 prompt voice typique (10s audio in, 80 mots out) |
|---|---|---|
| STT `gpt-4o-mini-transcribe` | $0.003 / minute | 10s = $0.0005 |
| LLM `gpt-4o-mini` | $0.15 / 1M input, $0.60 / 1M output | ~600 input + 400 output = $0.0003 |
| TTS `gpt-4o-mini-tts` | $0.015 / 1M chars (input) + $0.60 / 1M (audio) | 80 mots ≈ 400 chars = $0.0003 |
| **Total / prompt voice** | | **~$0.001** |
| S3 storage audio | $0.023 / GB / mois | 1 audio MP3 ≈ 50 KB → 1M audios ≈ 50 GB → $1.15/mois |

À comparer : OpenAI Realtime gpt-realtime = ~$0.30/minute conversation. Notre pipeline V1 est ~10x moins cher pour un usage walkie-talkie.

## Mesure latence (à faire en J2 terrain)

Cibles V1 (5 essais par environnement) :
- iPhone wifi P50 < 3500ms
- iPhone 4G/5G P50 < 4500ms
- Pixel wifi P50 < 3500ms

Si dépassement → ticket V1.1 Realtime WebRTC.

Décomposition à logger :
- `t_audio_upload` (mobile → BE)
- `t_transcription` (Whisper call)
- `t_llm` (LangChain call)
- `t_tts_synth` (TTS call)
- `t_audio_download_first_byte` (BE → mobile)

## Évolution V1.1 (out of scope V1)

- **OpenAI Realtime WebRTC** — uniquement si latence V1 inacceptable.
- **Streaming TTS chunks** (audio pendant LLM stream) — non viable sans SSE actif (cf. ADR-001).
- **Multi-langue switch in-session** (FR ↔ EN).
- **Multiple voices in-session** (V1 = 1 voix par défaut).
- **Lock-screen integration** via `react-native-track-player`.
- **Word-by-word transcript live**.
- **Audio guides walks pré-générés** — précompute service en J2 BE pose les fondations.

## Sources documentation

- OpenAI Realtime API (référence V1.1) : <https://developers.openai.com/api/docs/guides/realtime-webrtc>
- OpenAI gpt-4o-mini-transcribe : <https://platform.openai.com/docs/models/gpt-4o-mini-transcribe>
- OpenAI gpt-4o-mini-tts : <https://platform.openai.com/docs/models/gpt-4o-mini-tts>
- Gemini Live (alternative LLM) : <https://ai.google.dev/gemini-api/docs/live-api>
- LiveKit Agents (V1.1 si Realtime) : <https://docs.livekit.io/agents/>
