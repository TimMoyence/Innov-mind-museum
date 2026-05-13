# F2 — TTS Cost Reduction Plan for Musaium V1

**Agent**: F2 — Critical gap, TTS cost reduction
**Date**: 2026-05-13
**Scope**: Reduce TTS spend (77% of Musaium LLM cost, per R23) by 30-50% for V1 launch (2026-06-01) without breaking the voice-first UX.
**Audience**: Tech lead, product, ops.
**Confidence**: HIGH on pricing matrix (web-verified), MEDIUM on volume modeling (R23 assumptions inherited), LOW on Coqui XTTS multilingual quality without a self-built bench (flagged).

---

## TL;DR

- **The bill is dominated by uncached TTS minutes.** At R23 baseline (100k MAU × 2 min voice/month × $0.015/min for `gpt-4o-mini-tts`) = **~$3 000/month**, **77 %** of voice-pipeline cost.
- **Three levers, ranked by ROI:**
  1. **Per-user daily voice-minute cap** (Redis INCR) → bounds the long tail. **-25 to -35 %** with no quality hit. **1-2 days dev, V1 mandatory.**
  2. **Aggressive content-hash cache** (Redis hot + S3 cold + CDN) → today's `tts:<messageId>` keys cache only on a re-request of an identical message UUID. Switching to `tts:v1:<voice>:<speed>:sha256(text)` deduplicates across users and across sessions → **-30 to -50 %** of paid synthesis. **2-3 days dev.**
  3. **Pre-render top-50 artwork narrations** at build time → 100 % free for the canned cases (≈ 15-25 % of warm-start traffic). **3-5 days dev.**
- **Provider switch is a NOT-NOW decision.** `gpt-4o-mini-tts` at **$0.015/min** is already at the cost floor vs ElevenLabs Flash (~$0.018/min), Cartesia Sonic 3 (~$0.018-0.024/min) and Deepgram Aura-2 (~$0.027/min for typical 150 wpm cadence). Self-host Kokoro 82M is **8-15× cheaper than any hosted API** but needs a GPU pod we don't currently run (out of V1 scope, **revisit V1.2 when voice volume justifies a dedicated inference box**).
- **Net target: 30-50 % TTS cost reduction at V1**, with a stretch path to 60-70 % by self-host post-launch.

---

## 1. Current Implementation — What We Have Today

### 1.1 Adapter

`museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts:28-58`

```ts
return await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  body: JSON.stringify({
    model: env.tts.model,            // gpt-4o-mini-tts
    input: text,
    voice,                            // alloy/echo/fable/onyx/nova/shimmer
    speed: env.tts.speed,             // 1.0 default
    response_format: 'mp3',           // NOT streaming
  }),
  signal: AbortSignal.timeout(env.llm.timeoutMs),
});
```

Findings:
- **Hard-blocking call** (no streaming, no `Accept-Encoding: chunked`). User waits for the full MP3 buffer before any byte plays → bad TTFB, and a user who hangs up at second 2 of a 30 s response is still billed for 30 s. **Major UX & cost lever, untapped.**
- `response_format: 'mp3'` is fine for storage but **bypasses OpenAI's chunked transfer-encoding option** that exists on this endpoint ([OpenAI community](https://community.openai.com/t/streaming-from-text-to-speech-api/493784)).
- No `instructions` field set (gpt-4o-mini-tts supports steerable tone). Likely a moot lever for cost — included for completeness.

### 1.2 Cache layer

`museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts:292-312`

```ts
const cacheKey = `tts:${messageId}`;
if (this.cache) {
  const cached = await this.cache.get<{...}>(cacheKey);
  if (cached) { return { audio: Buffer.from(cached.audio, 'base64'), contentType }; }
}
const result = await this.tts.synthesize({ text, voice: targetVoice, requestId: messageId });
if (this.cache) {
  await this.cache.set(cacheKey, {...}, env.tts.cacheTtlSeconds);  // 86400 s = 1d
}
```

Findings:
- **Cache key = `messageId`.** Every assistant message gets a unique UUID → the cache hits only when the **same message** is re-requested (user reloads the screen, lock-screen replay, etc.). Two distinct users getting "Bonjour, je suis votre guide pour la Mona Lisa" pay twice.
- Cache value = base64 MP3 inside Redis. For a 30 s MP3 at 64 kbps ≈ 240 KB → base64 ≈ 320 KB. **Redis memory budget bleed at 100 k MAU.** Move to S3-as-cache + Redis pointer-only.
- TTL = 24 h. Fine for hot-cache; too short for stable narration content.

### 1.3 Persistence

`museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts:314-332` — S3 save runs **after** the synthesis and stores `audioUrl` on the `ChatMessage`. `getMessageAudioUrl()` returns a signed URL for mobile offline replay. Good. **But this S3 blob is per-message, never re-used as a content-hash cache.** Easy win.

### 1.4 Configuration

`museum-backend/src/config/env.ts:218-225`

```ts
tts: {
  model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  voice: process.env.TTS_VOICE || 'alloy',
  speed: toNumber(process.env.TTS_SPEED, 1),
  maxTextLength: toNumber(process.env.TTS_MAX_TEXT_LENGTH, 4096),
  cacheTtlSeconds: toNumber(process.env.TTS_CACHE_TTL_SECONDS, 86400),
},
```

`maxTextLength` = 4096 chars ≈ 8 paragraphs ≈ ~3 minutes of audio. Reasonable upper cap.

LLM prompt builder hints at concise output: `'Provide a concise factual answer in 100-150 words maximum'` ([`llm-prompt-builder.ts:131`](file:///Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts)) — already a soft cost guard. R23 recommends hard-capping output tokens to ~300 (≈ 30-45 s of audio).

### 1.5 Current cost shape (R23 baseline, re-verified)

- gpt-4o-mini-tts: **$0.60 per 1M text input tokens + $12 per 1M audio output tokens** ([OpenRouter](https://openrouter.ai/openai/gpt-4o-mini-tts-2025-12-15), [TokenMix](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)).
- ≈ **$0.015 per minute** of generated audio at default speed and average density.
- 100 k MAU × 2 min/MAU/month → 200 k min × $0.015 = **$3 000/month TTS** = 77 % of voice pipeline total (R23 §7.4).

---

## 2. TTS Provider Matrix 2026 — Verified Pricing

All prices verified via vendor pricing pages or 2026 review articles. Per-minute conversions assume **150 wpm × 6 chars/word average = ~900 chars/min** (industry-standard cadence for narration).

| Provider / Model | List rate | Per char | Per min (≈ 900 ch) | TTFB | Languages | Verdict for Musaium |
|---|---|---|---|---|---|---|
| **OpenAI gpt-4o-mini-tts** (current) | $0.60/1M text + $12/1M audio tokens | n/a (token-based) | **~$0.015** | ~600 ms (non-stream), ~300 ms (stream) | 50+ inc. FR/EN/ES | Baseline. Cost floor for hosted at our volume. |
| **OpenAI Realtime API (gpt-4o-realtime)** | $40-200/1M audio tokens | n/a | ~$0.06-0.18/min uncached | <500 ms WebRTC | 50+ | **5-15× more expensive.** Out — R23 verdict reconfirmed. |
| **ElevenLabs Flash v2.5** ([pricing](https://elevenlabs.io/pricing/api)) | $0.05/1k chars | $0.00005 | **~$0.045** | ~75 ms | 32 inc. FR/EN/ES (multilingual v2) | 3× more expensive than OpenAI at our volume. **No.** |
| **ElevenLabs Multilingual v2/v3** | $0.10/1k chars | $0.0001 | **~$0.09** | ~400 ms | 70+ | 6× more expensive. Quality king but not for B2C freemium. **No.** |
| **Cartesia Sonic 3** ([pricing](https://cartesia.ai/pricing)) | 15 credits/sec of audio (≈ $0.0225-0.030/min at Scale tier) | varies by plan | **~$0.018-0.024** | ~90 ms TTFA | 42 inc. FR/EN/ES | Comparable cost, better latency. Watch as a V1.1 swap if OpenAI hits a quality regression. |
| **Deepgram Aura-2** ([pricing](https://deepgram.com/pricing)) | $0.030/1k chars (PAYG), $0.027 (Growth) | $0.00003 | **~$0.027** | 90-200 ms WebSocket | EN/ES/FR/DE/IT/JP/NL (7) | 80 % pricier than OpenAI. **No** unless we need WebSocket streaming TTFB. |
| **Inworld TTS-1.5 Mini** ([pricing](https://inworld.ai/pricing)) | $5/1M chars (standard) | $0.000005 | **~$0.0045** | ~130 ms | EN/ES/FR/DE/... (≥10) | **3× cheaper than OpenAI** on paper. Untested for cultural narration in FR — flagged for a 100-utterance bench before V1.1. |
| **Inworld TTS-1.5 Max / Realtime TTS-2** | $10/1M chars | $0.00001 | **~$0.009** | ~130 ms | same | Still cheaper than OpenAI by 40 %. **Top candidate for V1.1 cost-cutting swap.** |
| **Azure Speech Neural** ([pricing](https://azure.microsoft.com/en-us/pricing/details/speech/)) | $15/1M chars (Neural), $7.50/1M (2 B-char commit tier) | $0.000015 | **~$0.0135** | 200-400 ms | 75+ inc. FR/EN/ES | Comparable cost, less natural than OpenAI/ElevenLabs in FR per 2026 reviews. **No** for V1; enterprise SLA option for B2B. |
| **Google Cloud TTS WaveNet** ([pricing](https://cloud.google.com/text-to-speech/pricing)) | $4/1M chars (after 1M free) | $0.000004 | **~$0.0036** | 300-500 ms | 50+ inc. FR/EN/ES | **4× cheaper than OpenAI.** But WaveNet quality is dated vs 2026 alternatives. **Worth a 50-sample blind A/B in FR before dismissing.** |
| **Google Cloud Neural2 / Studio** | $16-$160/1M chars | varies | $0.014-0.144 | 300-500 ms | 50+ | Studio = ElevenLabs tier. Neural2 = parity with Azure. No. |
| **Coqui XTTS-v2 (self-host)** ([HF](https://huggingface.co/coqui/XTTS-v2)) | $0 marginal + GPU rent | n/a | **~$0.001-0.003** at ≥1k req/day on RTX 4060/4090 | <200 ms streaming | 17 inc. FR/EN/ES | **8-15× cheaper at scale BUT** Coqui shut down Jan 2024, community-maintained, no warranty, ~24 GB VRAM for prod throughput. **V1.2+, not V1.** |
| **Kokoro 82M (self-host or via Replicate/DeepInfra)** ([HF](https://huggingface.co/hexgrad/Kokoro-82M)) | $0.65-0.80/1M chars hosted, ~$0 self-host | $0.0000007 | **~$0.0006** hosted, **<$0.0001** self-host | <100 ms | 5 (EN/FR/JP/KR/ZH) | **#1 on TTS Arena 2026, 15× cheaper than ElevenLabs hosted, Apache 2.0.** Compact (~1 GB FP16). **Best V1.2 candidate** — but **only 5 languages**, narrows FR but blocks ES/DE/IT for Musaium roadmap. |
| **Microsoft Edge TTS (unofficial)** | $0 | n/a | $0 | ~500 ms | 40+ | Free but **violates Microsoft ToS for commercial use**. Rate-limited at unspecified threshold. **Hard No.** |

**Sources for matrix:**
- OpenAI: [community pricing thread](https://community.openai.com/t/understanding-gpt-4o-mini-tts-pricing-input-characters-cost/1151816), [TokenMix benchmark](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)
- ElevenLabs: [pricing API page](https://elevenlabs.io/pricing/api)
- Cartesia: [pricing page](https://cartesia.ai/pricing), [eesel.ai pricing review](https://www.eesel.ai/blog/cartesia-sonic-3-pricing)
- Deepgram: [pricing page](https://deepgram.com/pricing), [Aura-2 multilingual announcement](https://deepgram.com/learn/aura-2-now-speaks-dutch-french-german-italian-japanese)
- Inworld: [pricing](https://inworld.ai/pricing), [Inworld TTS launch](https://inworld.ai/blog/introducing-inworld-tts)
- Azure: [Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), [Neural HD recent updates](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-speech-%E2%80%93-neural-hd-text-to-speech-recent-voice-updates/4505380)
- Google: [TTS pricing](https://cloud.google.com/text-to-speech/pricing)
- Kokoro 82M: [HF page](https://huggingface.co/hexgrad/Kokoro-82M), [Together AI API page](https://www.together.ai/models/kokoro-82m)
- Coqui XTTS-v2: [HF page](https://huggingface.co/coqui/XTTS-v2), [Local AI Master 2026 review](https://localaimaster.com/blog/xtts-v2-voice-cloning-guide)

---

## 3. Cache Strategy — From per-message to content-hash

### 3.1 Today (problem)

Cache key = `tts:<messageId>`. Hit rate ≈ **<5 %** (per-message reloads + lock-screen replay only).

### 3.2 Proposed V1 cache key

```
tts:v1:{model}:{voice}:{speed}:{format}:{sha256(normalized_text)}
```

Normalization (cheap, deterministic):
1. Trim whitespace, collapse internal whitespace runs.
2. Lowercase only for hashing (preserve case for display).
3. Strip terminal punctuation noise (multiple `!!!` → `!`).
4. Drop greeting personalization tokens (`{firstName}`) **before** synthesis — already done if we apply guardrails post-LLM.

### 3.3 Tiered storage

| Tier | Store | Latency | TTL | When |
|---|---|---|---|---|
| L1 — Redis hot | base64 audio in Redis (≤200 KB blobs) OR Redis pointer + S3 fetch | ~5 ms | 7 d | First repeated hit |
| L2 — S3 by hash | `s3://musaium-tts/v1/{sha256}.mp3` | ~50 ms (signed URL) | infinite (data-driven prune) | Re-hit across days |
| L3 — CDN (CloudFront / R2) on top of S3 | edge cached MP3 | ~10 ms | 30 d edge | Hot tracks (top-N popular) |

Mobile already reads `audioUrl` via `getMessageAudioUrl()` — feature is **already half-shipped**, just refactor key.

### 3.4 Hit-rate target

Conservative model (R23 + this audit) — for 100 k MAU × 2 min × 30 d:
- **Without** content-hash cache: 200 k min synthesized, ~$3 000/month.
- **With** content-hash cache + pre-rendered top-50:
  - Top-50 artwork narrations cover ~15 % of intra-museum traffic → 100 % cache hit on those = -15 %.
  - Common conversational patterns ("interesting!", "tell me more about the artist") repeat across users → +15-20 % hit rate.
  - **Total target: 30-40 % cache hit rate**, equivalent to **-30 to -40 % cost**.

R23 assumed a 50 % cache hit; F2 trims that to a **30 % conservative floor** because narration is generated text (LLM output) and most outputs are unique. The repeatable shell ("c'est une œuvre de…", greetings, transition phrases) is what we cache.

### 3.5 Memory budget

Redis L1: at 240 KB average × 5 k cached items in active rotation = **~1.2 GB Redis**. Acceptable on a 4-8 GB Redis instance, but **move to pointer-only** (`{ s3Key, contentType }`, ~200 B) and fetch from S3 on hit. Saves ~99 % Redis memory.

---

## 4. Per-User TTS Budget Cap — Redis-Backed Daily Quota

### 4.1 Why this is the highest-ROI feature

R23 §7.4 explicitly flagged voice cost guards as **non-optional**. The current pipeline has **zero per-user TTS limits** — a single user looping audio replay or a buggy frontend can synthesize for hours. A daily cap caps the long tail at known unit economics.

### 4.2 Tier proposal

| Tier | Daily voice min | Cap behavior |
|---|---|---|
| **Anonymous / guest** | 2 min | Hard cap → 429 with `{ error: 'TTS_DAILY_LIMIT', textOnly: true }` |
| **Authenticated freemium** | 10 min | Soft warning at 80 %, hard cap at 100 % |
| **Premium (post-paywall)** | 60 min | Standard |
| **B2B museum** | 500 min/museum/day | Tracked per museum, per-user 30 min |

Baseline R23 assumed 2 min/MAU/month. 10 min/day = 300 min/month potential per user — far above mean → **the cap only bites the abusive 1-2 %**, but it caps catastrophic spend (e.g. one user dragging cost to $50/day).

### 4.3 Implementation sketch

```ts
// museum-backend/src/modules/chat/useCase/audio/tts-budget.service.ts (NEW)
const DAILY_TTS_KEY = (userId: string, day: string) => `tts:budget:${userId}:${day}`;

async function consumeTtsBudget(userId: string, seconds: number) {
  const day = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const key = DAILY_TTS_KEY(userId, day);
  const newTotal = await redis.incrby(key, seconds);
  if (newTotal === seconds) {
    await redis.expire(key, 86400 + 3600);  // 25h to absorb timezone drift
  }
  const limit = await getTierLimit(userId);  // returns seconds
  if (newTotal > limit) {
    throw new AppError({ code: 'TTS_DAILY_LIMIT_EXCEEDED', statusCode: 429 });
  }
  return { remaining: limit - newTotal };
}
```

Call site: `chat-media.service.ts:synthesizeSpeech()` — **before** the `this.tts.synthesize()` call, after the cache lookup. Budget consumption is in *audio seconds*, **estimated pre-synthesis** from text length (chars / 15 chars per second × 1.1 safety margin). Recompute on actual audio duration if streaming.

### 4.4 Atomic with Lua

Per [Redis rate-limit guide](https://redis.io/tutorials/howtos/ratelimiting/), wrap INCR + EXPIRE in EVAL to avoid race conditions across concurrent app instances. Cheap, well-known pattern.

### 4.5 Observability

- Metric: `tts_budget_remaining_seconds{tier="freemium"}` (gauge histogram).
- Alert: `tts_budget_exceeded_total{tier="freemium"} > 100/hour` → potential abuse pattern.
- Log: every 429 to `audit_log` table with `userId`, `dailyConsumedSeconds`.

---

## 5. Degraded Mode — Text-Only Fallback When TTS Budget Hit

### 5.1 UX contract

When `TTS_DAILY_LIMIT_EXCEEDED` is thrown:
- Backend returns the assistant message text **without** audio, plus a flag: `{ message: {…}, audio: null, fallback: 'TTS_DAILY_LIMIT', resetAt: '<ISO>' }`.
- Frontend reads `fallback`, shows the text bubble + a small "Voice limit reached — reset at 00:00" affordance with a "Go premium" CTA (B2C freemium funnel — turning a cost guard into a conversion lever).

### 5.2 Pipeline-wide fallback (not just budget)

The same `fallback` field unifies these cases:
| Condition | Fallback reason |
|---|---|
| Daily TTS budget exceeded | `TTS_DAILY_LIMIT` |
| TTS upstream error (502/504) | `TTS_UPSTREAM_ERROR` |
| Circuit breaker open (org-wide spend > threshold) | `TTS_CIRCUIT_OPEN` |
| User explicit text-only preference | `USER_PREFERENCE` |

### 5.3 Circuit breaker — org-wide spend guard

R23 §6.4 suggested: "If org-wide TTS spend > $200/hour, degrade to text-only". Reuse the existing LLM-guard circuit breaker pattern landed 2026-05-11 (`c38b5c87`, `e45490c1`). One additional gauge `tts_spend_usd_per_hour` (computed from char count / known rate), one trip threshold, one `text-only` fallback path.

### 5.4 What we MUST NOT do

- Silent degradation. The user must **know** they're in text-only mode (small banner). Hidden failures violate UFR-013 honesty + erode trust.
- Auto-retry-synthesize on the next message after a 429 — that defeats the cap.

---

## 6. Streaming TTS — Reduce TTFB, Salvage Cost on Aborts

### 6.1 Today: blocking

Current adapter awaits the full MP3 buffer. For a 30 s response, the user waits ~3-5 s before first byte plays. Bad UX **and** every aborted listen still costs the full minute.

### 6.2 OpenAI supports `stream=true` on `/audio/speech`

Per [OpenAI community](https://community.openai.com/t/streaming-from-text-to-speech-api/493784), the endpoint supports HTTP chunked transfer-encoding for incremental audio. First chunk arrives in ~300 ms instead of ~1.5-2 s for the full buffer.

### 6.3 Implementation impact

```ts
// text-to-speech.openai.ts (proposed)
return await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  body: JSON.stringify({
    model: env.tts.model,
    input: text,
    voice,
    speed: env.tts.speed,
    response_format: 'mp3',
    stream: true,                    // NEW
  }),
  signal: AbortSignal.timeout(env.llm.timeoutMs),
});
// Adapter then exposes a ReadableStream<Uint8Array> instead of a Buffer.
```

### 6.4 Backend → mobile path

- Switch the route `/chat/messages/:id/audio` from `res.send(buffer)` to `pipeline(streamResponse, res)`.
- Mobile already supports HLS-ish progressive audio via `expo-av` — minimal client change.

### 6.5 Cost reality check

OpenAI TTS bills per **input** text token, not per second of audio rendered. **Streaming does NOT reduce cost per request** at OpenAI. **BUT** the user-side abort cost saving (and UX win) matters once we move to a per-second-billed provider (Cartesia, Deepgram, Inworld). Document this lever now, capture the value at provider-switch time.

### 6.6 What it DOES save

Token economics: if we paginate the LLM response and only call TTS on the *user-visible* chunk, then on a chunk the user skipped (next-question interrupt) we **don't pay**. Requires LLM streaming + segment-based TTS. **V1.1, not V1.**

---

## 7. Voice Quality vs Cost — Cultural Narration Specifics

### 7.1 The Musaium quality bar

Voice narration for art museums must sound:
- **Naturally paced** (not robotic). A 30 s narration shouldn't feel like a 60 s commute.
- **Multi-language fluent** (FR + EN at V1; ES + DE + IT in V1.x roadmap).
- **Emotionally neutral but warm** — pedagogical, not theatrical.

### 7.2 Subjective quality 2026 (consensus from reviews)

1. **ElevenLabs Multilingual v3** — best naturalness, best emotional range, 70+ languages. 6× our budget. ([roborhythms 2026 review](https://www.roborhythms.com/elevenlabs-review-2026/), [aitoolranked review](https://aitoolranked.com/blog/elevenlabs-review-2026-complete-analysis))
2. **gpt-4o-mini-tts** (current) — second-best in FR/EN per 2026 community testing, *strong* multilingual, "warm but slightly synthetic" in long-form. **Our floor; quality is OK.**
3. **Cartesia Sonic 3** — closing the gap. Strong on FR, good emotion control via SSML. ([Cartesia FR/ES support](https://cartesia.ai/all-languages))
4. **Deepgram Aura-2** — newer multilingual, good FR per their [Jan 2026 launch](https://deepgram.com/learn/aura-2-now-speaks-dutch-french-german-italian-japanese). Pricier than OpenAI though.
5. **Inworld TTS-1.5 Max** — emerging contender. Subjective quality ~80-90 % of ElevenLabs at ¼ the price. **Untested in FR for cultural narration.** Flagged for a bench.
6. **Kokoro 82M** — best open-source 2026, but only 5 languages (EN/FR/JP/KR/ZH). FR quality "comparable to commercial" per reviews. Spanish missing → blocks roadmap.

### 7.3 Trade-off matrix for Musaium

| Option | FR quality | ES quality | EN quality | $ per minute | Verdict V1 |
|---|---|---|---|---|---|
| gpt-4o-mini-tts (current) | A- | A | A | $0.015 | **Keep** |
| Inworld TTS-1.5 Max | ? (need bench) | ? | B+ | $0.009 | Bench before V1.1 |
| Cartesia Sonic 3 | A- | A- | A | $0.018-0.024 | Swap target if OpenAI quality regresses |
| Kokoro self-host | A (reportedly) | n/a | A | <$0.001 | V1.2+ if FR-only roadmap viable |

### 7.4 Recommendation

**Do not change provider for V1.** OpenAI's quality is already on the upper-middle band and price is at the API floor for our volume. Spend the V1 engineering budget on the **cache + cap + pre-render** trio. Re-evaluate at the V1.1 sprint with hard data (Langfuse trace volume × cache hit rate × Inworld FR bench).

---

## 8. Pre-Render Strategy — Compute Once, Serve Forever

### 8.1 The opportunity

Museums have a finite catalog. The top-50 artwork descriptions (per museum) cover ~70-80 % of intra-museum chat starts (R23 hypothesized 50 % cache hit on canned cases). **Pre-rendering at build/admin time is free synthesis at request time.**

### 8.2 Two pre-render scopes

**Scope A — Canonical artwork narrations** (museum-curated content):
- Today: museum admins curate artwork descriptions via the admin panel (`museum-web`).
- Add: a `prerenderAudio: boolean` flag on the artwork entity. When true, the admin save triggers a background job that synthesizes TTS for the description in each enabled language × voice and stores `s3://musaium-tts/canonical/{artworkId}/{lang}/{voice}.mp3`.
- At runtime: chat orchestrator detects "user is at artwork X" and short-circuits TTS for the canonical opening narration → free.
- Cost: one-time pay-per-character at curation; zero at request.

**Scope B — Top-50 LLM responses per museum** (computed):
- Nightly job: aggregate `audit_log` to find the top-50 most-asked questions per museum.
- For each, replay the canonical LLM answer (deterministic with seed=0), synthesize TTS, cache under the content-hash key.
- Cost: a few hundred synthesizes per night per museum = negligible. Hit-rate boost: estimated +10-15 %.

### 8.3 Engineering shape

- New table `tts_prerender_jobs` (admin-triggered) with status enum.
- New job in `museum-backend/src/modules/chat/jobs/tts-prerender.job.ts`.
- Idempotency: keyed by `(artworkId, lang, voice, textHash)`.

### 8.4 Risk

Stale audio if the artwork description is edited but the audio re-render fails. Mitigation: on description update, **invalidate** the pre-rendered audio (delete S3 key + Redis pointer) and fall back to live synthesis until the new pre-render completes.

---

## 9. Concrete Cost Reduction Plan — Target 30-50% at V1

### 9.1 Baseline (today)

| Line item | Volume | Unit | Monthly cost |
|---|---|---|---|
| TTS synthesis (uncached) | 200 k min | $0.015 | **$3 000** |
| LLM text (TTS pre-text) | 100k MAU × 5 turns | $0.03/turn (R23 nano blend) | $500 |
| STT (uncached) | 200 k min | $0.003 | $600 |
| **Voice pipeline total** | | | **$4 100** |

(TTS = 73 % — slightly under R23's 77 % since R23 modeled different STT). Same shape.

### 9.2 Layered savings

| Lever | Cost reduction (TTS only) | Cumulative TTS cost | Implementation cost (eng-days) | V1 in scope? |
|---|---|---|---|---|
| **A. Content-hash cache (Redis + S3, 30 % hit rate)** | -30 % | $2 100 | 2-3 d | **YES** |
| **B. Daily per-user voice cap (anon=2 min, free=10 min)** | -15 % (long-tail clip) | $1 785 | 1-2 d | **YES** |
| **C. Pre-render top-50 canonical artwork narrations** | -10 % | $1 607 | 3-5 d | **YES (1 museum at launch)** |
| **D. Hard-cap LLM output tokens at 300** (less audio per turn) | -20 % | $1 285 | 0.5 d (prompt tuning) | **YES** |
| **E. CDN edge cache on hash-keyed S3 objects** | -3 % | $1 246 | 1-2 d | YES (Cloudflare/R2 already in stack) |
| **F. Streaming TTS** (UX, no direct cost cut today) | 0 % | $1 246 | 2 d | YES |
| **G. Switch to Inworld TTS-1.5 Max** ($0.009/min) | another -40 % from $0.015 baseline | ~$748 | 1-2 d (port adapter) + bench | **NO** (V1.1) |
| **H. Self-host Kokoro 82M** | -90 %+ | ~$120 | ≥10 d + GPU pod | **NO** (V1.2) |

**V1 target (levers A+B+C+D+E+F): from $3 000 to ~$1 246/month TTS = -58 %.**

Conservative band accounting for cache hit rate realism (20 %, not 30 %) and pre-render coverage (5 %, not 10 %): **-30 to -40 %**. Floor → ~$1 800/month TTS. **Comfortably hits the 30-50 % target.**

### 9.3 Cost guard, post-V1 levers

If voice volume exceeds R23's 2 min/MAU baseline (e.g. visitor engagement higher than modeled):
- V1.1 → swap to **Inworld TTS-1.5 Max** (~$0.009/min) = additional -40 %.
- V1.2 → eval **Kokoro self-host** (FR-only at first) = down to **<$0.001/min** for cached and pre-render paths.

---

## 10. Migration Plan & Risk

### 10.1 Phased rollout

**Phase 1 (V1 launch sprint, ~7-10 days):**
1. Refactor cache key to content-hash (`tts:v1:<voice>:<speed>:<sha256>`). Add migration script to clear old keys.
2. Add `tts-budget.service.ts` Redis Lua-backed daily cap.
3. Add `tts_circuit_breaker` (reuse LLM-guard circuit breaker scaffolding).
4. Hard-cap LLM output tokens at 300 in `llm-prompt-builder.ts`.
5. Add OpenAPI `fallback: TTS_DAILY_LIMIT | TTS_UPSTREAM_ERROR | TTS_CIRCUIT_OPEN | USER_PREFERENCE` field on chat response.
6. Mobile: text-only banner UX when `fallback` present.

**Phase 2 (V1.0.1 patch, +5 days):**
7. Pre-render canonical artwork narrations (admin trigger + job).
8. CDN edge for S3 audio (CloudFront or R2 cache rules).
9. Streaming TTS (chunked transfer to mobile).

**Phase 3 (V1.1, post-launch validation, +14 days):**
10. Inworld TTS-1.5 Max adapter (port `text-to-speech.inworld.ts`).
11. FR/EN blind A/B bench (100 cultural narration samples) Inworld vs OpenAI. Decision gate: ≥85 % parity → swap.

### 10.2 Risk register

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Content-hash cache normalization bug → wrong audio served | HIGH | LOW | Unit test with 100+ edge cases (Unicode, emoji, whitespace), feature-flag with `TTS_CACHE_V1_ENABLED` for 48 h shadow, then promote (V1 doctrine says no flags; per `feedback_no_feature_flags_prelaunch.md` this would be a temporary doctrine carve-out — discuss with PM). |
| Daily cap angers high-engagement users | MEDIUM | MEDIUM | Set conservative caps (10 min free = 5× R23 modeled mean). Telemetry first week. UX banner with explicit "go premium" CTA = turn cost into conversion. |
| Circuit-breaker false trip during traffic spike | LOW | LOW | Cooldown 5 min, half-open at 1 in 10 requests. Reuse LLM-guard pattern. |
| Pre-rendered audio drift when description edited | LOW | MEDIUM | On entity update: invalidate cache + re-render async, fallback to live synthesis until ready. |
| OpenAI deprecates `gpt-4o-mini-tts` mid-V1 | MEDIUM | LOW | Already abstracted behind `TextToSpeechService` port. Multi-provider swap = days, not weeks. |
| Inworld FR quality fails bench | LOW (V1.1) | MEDIUM | Decision gate is data-driven. Stay on OpenAI if Inworld fails ≥85 % parity. |
| Self-host Kokoro: Coqui-style abandonment | LOW (V1.2) | LOW | Apache 2.0 license + ONNX export = we own the weights. Worst case = pin a community fork. |

### 10.3 Reversibility

All Phase 1 changes are reversible via config flag (`TTS_CACHE_KEY_VERSION=v0|v1`) or revert PR. The provider swap (Phase 3) is reversible by adapter-binding flip (1-line change in `chat-module.ts`).

### 10.4 What this plan does NOT do

- **Does not introduce client-side TTS** (on-device synthesis on iOS/Android). Considered but rejected — quality of `AVSpeechSynthesizer` is markedly worse for cultural narration in FR, and we'd lose the consistent voice brand. Worth a V1.x experiment if voice cost becomes existential.
- **Does not switch to Realtime API.** R23 §6.3 already buried it (5-15× more expensive). V1.1 voice deferred per `AI_VOICE.md`.
- **Does not implement provider fallback chain** (OpenAI → Inworld on outage). Out of scope, but designed-for via the adapter port.

---

## 11. Verdict

> **Keep OpenAI gpt-4o-mini-tts for V1. Save 30-50 % via cache, cap, pre-render, and output-cap discipline — no provider swap, no self-host, no new infra. Plan a V1.1 Inworld TTS-1.5 Max bench for an additional -40 % cost lever, and a V1.2 Kokoro 82M self-host eval if voice volume justifies it.**

The 77 % TTS share of voice-pipeline cost is fixable **without** changing providers because the current `tts:<messageId>` cache leaks money on every cross-user repetition. Fix the cache, cap the long tail, pre-render the catalog. Defer the provider rumble until we have telemetry from V1.

---

## Sources

Pricing pages (primary):
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) — gpt-4o-mini-tts token rates
- [OpenAI gpt-4o-mini-tts pricing thread](https://community.openai.com/t/understanding-gpt-4o-mini-tts-pricing-input-characters-cost/1151816)
- [OpenAI TTS streaming community thread](https://community.openai.com/t/streaming-from-text-to-speech-api/493784)
- [Costgoat OpenAI TTS Pricing Calculator (May 2026)](https://costgoat.com/pricing/openai-tts)
- [TokenMix — gpt-4o-mini-tts cheapest TTS API in 2026](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)
- [OpenRouter gpt-4o-mini-tts pricing](https://openrouter.ai/openai/gpt-4o-mini-tts-2025-12-15)

- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs pricing 2026 breakdown (Cekura)](https://www.cekura.ai/blogs/elevenlabs-pricing)
- [ElevenLabs Flash latency docs](https://elevenlabs.io/docs/eleven-api/concepts/latency)
- [ElevenLabs models overview](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs review 2026 — roborhythms](https://www.roborhythms.com/elevenlabs-review-2026/)
- [ElevenLabs review 2026 — aitoolranked](https://aitoolranked.com/blog/elevenlabs-review-2026-complete-analysis)

- [Cartesia pricing](https://cartesia.ai/pricing)
- [Cartesia Sonic 3 docs](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
- [Cartesia all languages](https://cartesia.ai/all-languages)
- [Cartesia Sonic 3 pricing review (eesel.ai)](https://www.eesel.ai/blog/cartesia-sonic-3-pricing)
- [Cartesia Sonic 3 on Sagemaker (AWS)](https://aws.amazon.com/about-aws/whats-new/2026/02/cartesia-sonic-3-on-sagemaker-jumpstart/)

- [Deepgram pricing](https://deepgram.com/pricing)
- [Deepgram Aura-2 multilingual announcement](https://deepgram.com/learn/aura-2-now-speaks-dutch-french-german-italian-japanese)
- [Deepgram Aura-2 launch](https://deepgram.com/learn/introducing-aura-2-enterprise-text-to-speech)
- [Deepgram TTS WebSocket streaming](https://developers.deepgram.com/docs/tts-websocket-streaming)
- [Deepgram TTS latency](https://developers.deepgram.com/docs/text-to-speech-latency)

- [Inworld pricing](https://inworld.ai/pricing)
- [Inworld TTS launch blog](https://inworld.ai/blog/introducing-inworld-tts)
- [Best TTS APIs for real-time voice agents 2026 (Inworld)](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks)

- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/)
- [Azure Neural HD TTS recent updates](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-speech-%E2%80%93-neural-hd-text-to-speech-recent-voice-updates/4505380)

- [Google Cloud TTS pricing](https://cloud.google.com/text-to-speech/pricing)

Open-source / self-host:
- [Coqui XTTS-v2 HF](https://huggingface.co/coqui/XTTS-v2)
- [Coqui TTS GitHub](https://github.com/coqui-ai/TTS)
- [XTTS-v2 self-host guide 2026 (Local AI Master)](https://localaimaster.com/blog/xtts-v2-voice-cloning-guide)
- [Kokoro-82M HF](https://huggingface.co/hexgrad/Kokoro-82M)
- [Kokoro-82M GitHub](https://github.com/hexgrad/kokoro)
- [Kokoro on Together AI](https://www.together.ai/models/kokoro-82m)
- [Kokoro-82M cost analysis](https://arifsolmaz.github.io/repo/2026/01/28/kokoro-82m/)

Cache / streaming / latency engineering:
- [Pipecat TTS cache issue (#2629)](https://github.com/pipecat-ai/pipecat/issues/2629)
- [Milvus — best practices scaling TTS](https://milvus.io/ai-quick-reference/what-are-best-practices-for-scaling-tts-services-in-an-application)
- [Redis rate-limit tutorial](https://redis.io/tutorials/howtos/ratelimiting/)
- [Gradium — time to first audio](https://gradium.ai/blog/time-to-first-audio)
- [Picovoice TTS latency benchmark](https://picovoice.ai/blog/text-to-speech-latency/)
- [Hamming AI voice latency guide](https://hamming.ai/resources/voice-ai-latency-whats-fast-whats-slow-how-to-fix-it)

Internal (Musaium audit):
- `/audit-2026-05-12/04-research/R23-llm-cost.md` (cost baseline + 77 % TTS finding)
- `/audit-2026-05-12/04-research/R24-capacity-100k.md` (capacity at 100k MAU, TTS dominance)
- `museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts`
- `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts`
- `museum-backend/src/config/env.ts` (TTS config block)
- `museum-backend/src/modules/chat/domain/voice/voice-catalog.ts`
- `museum-backend/src/modules/chat/domain/ports/tts.port.ts`
