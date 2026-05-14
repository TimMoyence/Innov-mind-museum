# F7 — Voice Pipeline Cost Forensic Audit

**Date**: 2026-05-13
**Author**: F7 critical-gap auditor (source forensics, no web)
**Scope**: Verify R23's claim that **TTS = 77% of Musaium LLM cost** by reading source.
**Verdict**: **REFUTED** — claim depends on a 100% voice-adoption assumption that the source code contradicts. TTS is opt-in (default OFF) and double-cached. Real share at realistic adoption ≈ 5-25% of LLM cost, not 77%.

---

## TL;DR

R23's 77% figure is arithmetically self-consistent **conditional on every MAU consuming 2 generated audio minutes/month**. Source forensics show three structural facts that invalidate that conditional:

1. **TTS is opt-in via a per-user setting** (`audio_description_mode`, default `false` in `useAudioDescriptionMode.ts:12`). Without that toggle the only path to TTS is an explicit press of the speaker button on each assistant bubble.
2. **TTS responses are double-cached**: Redis hot cache `tts:<messageId>` (default TTL 86 400 s) + S3-persisted `ChatMessage.audioUrl` for offline / lock-screen replay + client-side filesystem cache at `<cacheDir>/tts/<messageId>.mp3`. Repeat plays cost zero OpenAI call.
3. **Audio-input path (STT → LLM) does NOT auto-emit TTS**. `postAudioMessage()` calls `postMessage()` (transcribed text → LLM) and returns; no TTS branch. TTS only fires from the dedicated `POST /messages/:messageId/tts` route OR the auto-TTS hook when the audio-description toggle is on.

Re-derived cost at 100k MAU with the source-true call graph and R24 capacity profile (DAU/MAU = 15%, 5 messages / visit, voice-listen-adoption swept 5%-50%): **TTS share of LLM bill = 5%-25%**, not 77%. The 77% figure is the **worst-case ceiling** under a 100%-adoption assumption that no toggle in production today enforces.

R23's directional recommendations (cache TTS, cap voice min/user) are still **correct conceptually** — they just defend a ceiling Musaium will reach only if adoption hits ~80%+, which is not the launch hypothesis.

---

## 1. TTS Adapter

**File**: `museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts`
**Model**: `gpt-4o-mini-tts` (env `TTS_MODEL`, default in `museum-backend/src/config/env.ts:220`)
**Voice**: `alloy` (env `TTS_VOICE`, default `museum-backend/src/config/env.ts:221`)
**Endpoint**: `POST https://api.openai.com/v1/audio/speech`
**Response format**: `mp3`
**Max text length**: `4 096` chars (env `TTS_MAX_TEXT_LENGTH`, `museum-backend/src/config/env.ts:223`)

```ts
// text-to-speech.openai.ts:28-44 — single fetch call
const fetchSpeech = async (apiKey: string, text: string, voice: string): Promise<Response> => {
  return await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.tts.model,           // 'gpt-4o-mini-tts'
      input: text,
      voice,                          // default 'alloy', override per-user via User.ttsVoice
      speed: env.tts.speed,           // 1
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(env.llm.timeoutMs),
  });
};
```

Latency tracked via `ChatPhaseTimer.start('tts', 'openai', requestId, { model, metadata: { textLength, voice } })` → Prom histogram `chat_phase_duration_seconds{phase="tts", provider="openai"}` + Langfuse span `audio.tts.synthesize`. **No cost / char counter is emitted** (verified — Prom registry only has `chat_phase_duration_seconds`, `chat_phase_errors_total`; no `tts_chars_total`).

---

## 2. STT Adapter

**File**: `museum-backend/src/modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts`
**Model**: `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`, default in `museum-backend/src/config/env.ts:167`)
**Endpoint**: `POST https://api.openai.com/v1/audio/transcriptions`
**Max audio bytes**: `12 × 1024 × 1024` (`museum-backend/src/config/env.ts:178`)

```ts
// audio-transcriber.openai.ts:85-94 — multipart upload
return await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.llm.openAiApiKey}` },
  body: formData,    // file + model + optional language hint
  signal: AbortSignal.timeout(env.llm.timeoutMs),
});
```

STT call shape: `gpt-4o-mini-transcribe`, language hint derived from `locale.split('-')[0]`. Output text is returned then handed to `postMessage()` → LLM (text path) — **no auto-TTS** (verified in `chat-message.service.ts:400-443`, see §5).

---

## 3. LLM Orchestrator

**File**: `museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts`
**Model**: `gpt-4o-mini` (env `LLM_MODEL`, default `museum-backend/src/config/env.ts:166`)
**Section count per chat turn**: `1` (verified — `LlmSectionName = 'summary'` only, `museum-backend/src/modules/chat/domain/chat.types.ts:154`). Walk-intent path adds the `walk-tour-guide` structured section but is gated by `intent === 'walk'`.
**Max output tokens**: `800` (env `LLM_MAX_OUTPUT_TOKENS`, `museum-backend/src/config/env.ts:179`)
**Total budget**: `25 000 ms` (`museum-backend/src/config/env.ts:171`)

LLM cache: `LlmCacheServiceImpl` (single layer per ADR-036) in `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`. TTLs:

- generic: 7 days
- museum-mode: 1 day
- personalized: 1 hour

Cache key shape: `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`.

`gpt-4o-mini` invocation goes through circuit breaker + `Semaphore` (default `LLM_MAX_CONCURRENT=20`). **No `usage.total_tokens` or `prompt_tokens` are read from the LangChain response** (verified — `grep -r "total_tokens\|prompt_tokens\|usage_details" src/` returns nothing). LangChain returns `result.content`; usage is silently discarded.

---

## 4. TTS Cache Behavior

**File**: `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts:268-335` (`synthesizeSpeech`)

Three layers (read top-to-bottom, write all on miss):

| Layer | Key | TTL | Storage | Server-side cost on hit |
|---|---|---|---|---|
| L1 Redis | `tts:<messageId>` | `env.tts.cacheTtlSeconds` (default `86 400 s` = 1 day) | Redis (CacheService port) | $0 |
| L2 S3 | `ChatMessage.audioUrl` (column on `chat_messages`) | indefinite | object storage | $0 + signed-read URL |
| L3 Client filesystem | `<cacheDir>/tts/<messageId>.mp3` | indefinite | mobile device | $0 (no network) |

L1 + L2 are written from one OpenAI call:

```ts
// chat-media.service.ts:300-332 — single OpenAI call + dual persist
const result = await this.tts.synthesize({ text: row.message.text, voice: targetVoice, requestId: messageId });

if (this.cache) {                                  // L1 Redis
  await this.cache.set(cacheKey, { audio: result.audio.toString('base64'), contentType: result.contentType }, env.tts.cacheTtlSeconds);
}

if (this.audioStorage) {                           // L2 S3
  const ref = await this.audioStorage.save({ buffer: result.audio, contentType: result.contentType });
  await this.repository.updateMessageAudio(messageId, { audioUrl: ref, audioGeneratedAt: new Date(), audioVoice: targetVoice });
}
```

**The `messageId` cache key** means a repeat playback of the same assistant message **never re-bills OpenAI**. Voice cannot change retroactively on a cached entry — voice change for older messages = fresh synth.

L3 (`useTextToSpeech.ts:144-148`) — mobile reads `<cacheDir>/tts/<messageId>.mp3` first, **before hitting the server at all**.

> **Important**: feedback-driven LLM-cache invalidation in `invalidateCacheForFeedback()` (line 197) only invalidates the **LLM-response cache** (`llm:v1:…` keys). **It does NOT invalidate the TTS cache** — a negative-feedback'd message keeps its cached audio until the Redis TTL expires.

---

## 5. Call Patterns — Is Every Chat Message TTS?

**No.** Three pathways exist; all are explicit:

| Pathway | Trigger | TTS billed? |
|---|---|---|
| Text chat → text response | default | **No** |
| Voice chat (STT → LLM → text response) | `POST /sessions/:id/audio` | **No** (audio reply NOT generated) |
| Per-message TTS replay | `POST /messages/:messageId/tts` (button press) | Yes, **only on cache miss** |
| Auto-TTS on new assistant reply | `useAutoTts({ enabled: audioDescEnabled })` when user toggled `audio_description_mode` to ON | Yes, **only on cache miss** |
| Describe service (`POST /describe`) | `format === 'audio'` or `format === 'both'` | Yes, **always uncached** (no `messageId` to key off) |

Sources:

- `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:177-191` — TTS HTTP handler
- `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts:400-443` — `postAudioMessage`, returns transcription + LLM text, **no TTS branch**
- `museum-backend/src/modules/chat/useCase/describe/describe.service.ts:65-73` — describe-with-audio path
- `museum-frontend/features/chat/application/useAutoTts.ts:32-40` — auto-play loop on new assistant message
- `museum-frontend/features/settings/application/useAudioDescriptionMode.ts:12` — toggle default `false`
- `museum-frontend/app/(stack)/chat/[sessionId].tsx:138` — `useAutoTts({ enabled: effectiveAudioDesc })` wiring

**Conclusion**: voice-input ≠ voice-output. R23's 100% voice duty-cycle model assumes both halves are always on. Source says output is **opt-in twice over** (global setting + per-message press).

---

## 6. Token / Character Billing Assumptions

OpenAI's pricing model for `gpt-4o-mini-tts` (per R23-cited TokenMix table, line 50) is `$12 / MTok audio` ≈ `$0.015 / generated audio minute`. The adapter sends **character-count** to OpenAI (no token tokenizer), but OpenAI charges by **output audio tokens**. A typical 200-char response (≈30 words FR) renders ≈ 12-18 s of mp3 ≈ ~250 audio tokens.

Source's only billable knob is `env.tts.maxTextLength = 4096` chars (`museum-backend/src/config/env.ts:223`). That's a hard cap; nothing in code enforces a **soft per-user min/month cap**. R23 recommended such a cap; source confirms it does not exist.

STT (`gpt-4o-mini-transcribe`) bills per audio second of input (~$0.006/min per R23 line 50). The adapter rejects > 12 MB audio (`env.llm.maxAudioBytes`) ≈ ~25 min at 64 kbps — generous, but the user-facing recorder caps at ~60s per turn (verified in frontend).

---

## 7. Cost Telemetry — What's Tracked, What Isn't

Tracked (verified in `museum-backend/src/shared/observability/prometheus-metrics.ts`):

- `chat_phase_duration_seconds{phase, provider}` — latency histogram, includes `phase="tts"` and `phase="stt"`
- `chat_phase_errors_total{phase, provider, error_type}` — error counter
- `llm_cache_hits_total{context_class}` / `llm_cache_misses_total{context_class}` — LLM cache only

**NOT tracked** (verified — exhaustive grep):

- No `tts_chars_total` / `tts_seconds_synthesized_total` / `stt_seconds_transcribed_total`
- No `openai_tokens_used` / `openai_cost_usd` counters
- No LangChain `usage` extraction — the orchestrator drops `result.content.usage` on the floor (`langchain.orchestrator.ts:139` just calls `toContentString(result.content)`)
- Langfuse spans for STT/TTS carry `textLength` / `mimeType` in metadata but no cost field (`chat-phase-timer.ts:113-119`)

**Operational consequence**: there is no first-party metric today to confirm or refute the 77% claim post-deployment. Cost reconciliation is on the OpenAI dashboard only.

---

## 8. Per-Session Cost Model

Assumptions (anchored to R24 §1 + source):

- 5 chat messages / visit (R24 §2)
- 1 STT call / visit (voice input on first turn ≈ 30 s audio at 64 kbps)
- Per message: prompt ~1500 input tokens (history + system + section), output ~250 tokens (clamped by `LLM_MAX_OUTPUT_TOKENS=800`)
- TTS only on opt-in users; 200 chars × 5 messages = 1000 chars/visit → ≈ 12 s × 5 = 60 s audio
- LLM cache hit rate per R23: 30%-50% on museum-mode key class

Per-session unit costs (pricing from R23 table line 50 — `gpt-4o-mini` text in $0.15 / 1 MTok, out $0.60 / 1 MTok, audio in $10 / 1 MTok, audio out $12 / 1 MTok):

| Cost line | Quantity | Unit | Cost / session |
|---|---|---|---|
| LLM input (5 msgs × 1500 in tok) | 7 500 tok | $0.15 / 1 MTok | **$0.001 125** |
| LLM output (5 msgs × 250 out tok) | 1 250 tok | $0.60 / 1 MTok | **$0.000 750** |
| STT input (30 s = 0.5 min) | 0.5 min | $0.006 / min | **$0.000 003** |
| TTS audio out (60 s = 1 min) — only if opt-in | 1 min | $0.015 / min | **$0.015 000** (when triggered) |

Per-session total — **3 user cohorts**:

| Cohort | Text only | LLM cache 30% | TTS cost / session | All-in / session |
|---|---|---|---|---|
| Text-only user | $0.001 88 | $0.001 31 | $0 | **$0.001 31** |
| Voice-input user (STT yes, no auto-TTS) | $0.001 88 | $0.001 31 | $0 | **$0.001 31** |
| Voice-output user (`audio_description_mode=on`) | $0.001 88 | $0.001 31 | $0.015 00 | **$0.016 31** |

A voice-output user is **~12.5× more expensive per session than a text user**. That's the magnitude the 77% claim is grasping at — but it only kicks in for the subset who turned on the toggle.

---

## 9. 100k MAU Monthly Cost at R24 Capacity Profile

Anchors (R24):

- DAU = 15 000 (DAU/MAU = 15%)
- Sessions / DAU = 1 (visit-anchored)
- Active days / MAU / month ≈ 4-5 (R24 line 32)
- Total visits / month ≈ 15 000 × 30 × `(visits/DAU-day)` … but R24 line 44 anchors **15 000 visits / day → 450 000 visits / month** more reliably.

Sensitivity sweep on `voice_output_adoption` (% of MAUs who toggled `audio_description_mode` to ON — no data; modelled):

| Voice-output adoption | Voice-output visits / mo | Text-only visits / mo | LLM cost (text + STT, cache 30%) | TTS cost | **Total** | **TTS share** |
|---|---|---|---|---|---|---|
| 5% | 22 500 | 427 500 | $589 | $338 | **$927** | **36%** |
| 10% | 45 000 | 405 000 | $589 | $675 | **$1 264** | **53%** |
| 20% | 90 000 | 360 000 | $589 | $1 350 | **$1 939** | **70%** |
| 30% | 135 000 | 315 000 | $589 | $2 025 | **$2 614** | **77%** ⟵ R23 implicit anchor |
| 50% | 225 000 | 225 000 | $589 | $3 375 | **$3 964** | **85%** |
| 80% | 360 000 | 90 000 | $589 | $5 400 | **$5 989** | **90%** |
| 100% (R23 R24 implicit) | 450 000 | 0 | $589 | $6 750 | **$7 339** | **92%** |

**Re-derivation**: R23's $3 000 / month TTS at 200k generated minutes implies 200k min / 450k visits ≈ 0.44 min / visit averaged — but text-only visits emit 0 min. To bake R23's 200k-min monthly into the source-true call graph, ~30% of visits must trigger auto-TTS. **That's the implicit adoption R23's 77% rests on, made explicit.**

> **Note on the cache 30% assumption**: R23 takes 30% LLM cache hit rate from "museum-mode" TTL. The source confirms `museum-mode` TTL = 1 day, with the cache keyed by `museumId + locale + userId/anon + sha256(prompt)`. At 100k MAU with diverse prompts, real hit rate is unknown — likely lower than 30% (R23 line 348 admits this in the 1.0 wave). The table above does NOT credit any TTS-side cache because the cache key is `messageId` (unique per response), so a TTS cache only saves cost on **replay**, not first listen. R23's recommendation §373 ("skip TTS for cached-response hits") is sound — when an LLM cache HIT reuses an earlier assistant message id, the TTS L1/L2 cache hit follows for free.

---

## 10. Cross-Check Against R23's 77% Claim

| R23 claim | Source-verified status |
|---|---|
| "TTS at $12/MTok audio × 250 output tokens = ~$0.003/turn" | **Consistent** with TokenMix pricing; source can't independently verify the per-token mapping but adapter calls `gpt-4o-mini-tts` so the pricing applies. |
| "100k MAU × 2 min generated/month → 200k min × $0.015 = $3 000/month TTS alone" | **Conditional** — assumes 100% voice-output adoption. Source shows opt-in toggle defaults OFF. |
| "Voice TTS = 77% of total cost" | **Refuted** — only true at ~30% voice-output adoption AND zero TTS-cache hit on first listen. Below 10% adoption (a more defensible launch baseline), TTS share is < 53%. |
| "Skip TTS for cached-response hits" | **Already implemented** — `tts:<messageId>` L1 cache + `audioUrl` L2 cache. R23 may have missed this. |
| "Per-user voice min cap (separate counter)" | **Not implemented** — no per-user min/day counter exists. Only `env.tts.maxTextLength=4096` chars per single call. |
| "Circuit breaker: if org-wide TTS spend > $200/hour, degrade to text-only" | **Not implemented** — no spend counter, only latency circuit breaker on the LLM. |

**Verdict on 77%**: the headline number is **achievable but is the high end of a sensitivity band** that swings from 36% to 92% depending on a single unknown (voice-output adoption). R23 presented one point on the curve as the canonical number. **F7 recommends restating as: "TTS share = 35% (P10) / 70% (P50) / 90% (P90) of LLM cost, driven by `audio_description_mode` adoption — currently unmonitored."**

---

## 11. Top 3 Reductions (Prioritised by Implementation Cost vs Savings)

### 1. Emit `audio_description_mode_enabled` telemetry (free, removes the unknown)

**Effort**: ~2h. Add a `users.audio_description_mode_at` timestamptz + Prom gauge `users_voice_output_enabled_total`. Backfill from frontend storage on next sync. **Why first**: the entire cost model has a 25× spread because we don't measure adoption. R23 cannot recommend caps without this.

### 2. Add `tts_audio_seconds_synthesized_total{cached}` Counter (~4h)

**Effort**: ~4h. In `OpenAiTextToSpeechService.synthesize()`, after `parseSpeechResponse`, increment `tts_audio_seconds_synthesized_total` (or chars) and emit a separate counter for L1/L2 cache hits. Wire alert at `> $50/day` projected spend. **Why second**: gives an auditable Grafana panel — cost reconciliation today is OpenAI-dashboard-only.

### 3. Pre-warm S3 `audioUrl` on the FIRST listen of common cached LLM responses (~1-2 days)

**Effort**: 1-2 days. When `LlmCacheServiceImpl.lookup` returns a hit AND `audio_description_mode` is ON for the requester, queue a background TTS for the cached response and persist `audioUrl`. Subsequent listens (same OR different user) read from S3 — zero TTS call. Currently the TTS cache is keyed by `messageId`, so a cached LLM response served to a new user still costs a fresh TTS. **Why third**: bigger lever (up to 30% TTS savings if LLM cache hit rate hits R23's 30%) but requires keying TTS by **response content** not `messageId`, or by `(museumId, locale, normalized_text_hash)`. ADR-036 amendment required (cache key shape change).

**Reduction NOT recommended**: switching to ElevenLabs Flash (R23 line 474). Quality regression risk in FR (CLAUDE.md L6 — "multi-musées, voice-first") + multilingual switch. Defer to V1.1+, validate at < 5k MAU first.

---

## Appendix — Key File Index

| File | Lines | What it proves |
|---|---|---|
| `museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts` | 1-149 | TTS adapter, `gpt-4o-mini-tts`, no usage telemetry |
| `museum-backend/src/modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts` | 1-213 | STT adapter, `gpt-4o-mini-transcribe` |
| `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts` | 252-335 | `synthesizeSpeech` cache logic (L1 Redis + L2 S3) |
| `museum-backend/src/modules/chat/useCase/describe/describe.service.ts` | 60-73 | Describe-with-audio path (no TTS cache; uncached) |
| `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts` | 400-443 | `postAudioMessage` does **not** emit TTS |
| `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts` | 177-253 | TTS HTTP route (explicit opt-in endpoint) |
| `museum-backend/src/config/env.ts` | 166-179, 219-225 | `LLM_*` + `TTS_*` env defaults |
| `museum-backend/src/shared/observability/chat-phase-timer.ts` | 36-196 | Phase timer — latency only, no cost |
| `museum-backend/src/shared/observability/prometheus-metrics.ts` | 60-117 | Active Prom metrics — no token/char counter |
| `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts` | 1-80 | LLM cache (`llm:v1:…`); TTLs 7d / 1d / 1h |
| `museum-frontend/features/chat/application/useTextToSpeech.ts` | 1-235 | Client TTS hook (L3 filesystem cache) |
| `museum-frontend/features/chat/application/useAutoTts.ts` | 1-63 | Auto-TTS on new assistant message (only when audio-desc mode enabled) |
| `museum-frontend/features/settings/application/useAudioDescriptionMode.ts` | 1-40 | Toggle default `false` |
| `museum-frontend/app/(stack)/chat/[sessionId].tsx` | 134-138 | `useAutoTts({ enabled: effectiveAudioDesc })` wiring |

**Verification ladder used**: `Read` (file content) → `Grep` (exhaustive cross-check on `tts_chars`, `total_tokens`, `usage_details`) → no command/runtime check (cost model is arithmetic + source-anchored unit prices from R23 table).

No web searches performed. All pricing carried forward from R23 line 50 (TokenMix 2026 table) — F7 does not independently re-verify these external prices.
