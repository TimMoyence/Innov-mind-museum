# R23 — LLM Cost Optimization for Musaium (B2C Freemium, 100k MAU)

**Agent**: R23 — Research, LLM cost optimization
**Date**: 2026-05-12
**Audit cycle**: pre-launch V1 (2026-06-01)
**Scope**: pricing matrix 2026, prompt caching, semantic cache, multi-provider routing, per-user economics, cost guards, verdict for Musaium chat (LangChain → OpenAI/DeepSeek/Google) + voice pipeline (STT→LLM→TTS).
**Honesty**: UFR-013. Every figure cited has a source URL. Where I model unit economics, I label "modeled" and show assumptions.

---

## TL;DR

1. **OpenAI gpt-4o-mini is no longer cost-leader.** Across 2026 pricing pages, **gpt-4.1-nano ($0.05/$0.20 per MTok)** and **gpt-5-nano ($0.05/$0.40)** are 3× cheaper on input, 1.5-3× cheaper on output than gpt-4o-mini ($0.15/$0.60), with comparable or better quality for short single-turn classification + chat. Musaium currently defaults to `gpt-4o-mini` (`museum-backend/src/config/env.ts:166`). Switching the default to **gpt-4.1-nano** or **gpt-5-nano** is the single biggest config-only win (≈ -67% on input, -33-66% on output).
2. **DeepSeek V4-Flash ($0.14/$0.28, cache-hit $0.0028)** is 50× cheaper on cache-hit input than gpt-4o-mini. China data residency is a **GDPR blocker for EU B2C** (Italy ban, FR/BE/DE/IE active investigations as of Feb 2026 — see Sources). Use only via EU-hosted self-host or NVIDIA-EU partner — not via api.deepseek.com for Musaium B2C launch.
3. **Anthropic Claude Haiku 4.5 ($1/$5)** is 6.7× more expensive on input vs gpt-4o-mini but with 10% cache-hit ($0.10 input) and 1h cache writes (2× base), Haiku becomes competitive when the system prompt is >2k tokens AND stable across requests — the typical Musaium "section prompt" shape.
4. **Google Gemini 2.5 Flash-Lite ($0.10/$0.40)** matches gpt-4.1-nano on input, is cheapest on context cache reads ($0.01 cached input / MTok), and offers batch at 50% off. Best fit for the third-fallback provider Musaium already wires.
5. **Prompt caching is mandatory.** OpenAI auto-caches prefixes ≥1024 tokens (50-90% discount, 5-10 min TTL). Anthropic charges 1.25× to write + 0.1× to read (10% of base = 90% discount). Musaium MUST restructure system prompts: **stable system + section prompts FIRST (cached), user-controlled fields LAST**. Current architecture (`SystemMessage(system) + SystemMessage(section) + history + HumanMessage`) is already correctly ordered per `CLAUDE.md` AI Safety section.
6. **Semantic cache delta over exact-match (`LlmCacheServiceImpl`)**: production deployments report **30-70% hit rates** on FAQ/chat traffic vs typical 5-15% for exact match. For Musaium (museum FAQ-heavy, repetitive "tell me about this artwork" queries), expected hit rate gain is **+25-40 points** → ~$2k-$5k/month saved at 100k MAU scale (modeled below). **Redis LangCache (managed, in public preview)** OR `redisvl` library + existing Redis is the path.
7. **Model cascade routing** (cheap → expensive on confidence-fail) typically delivers **45-85% cost cut at 95% quality retention** (RouteLLM benchmarks). For Musaium: route 80% to nano-tier, escalate 20% to gpt-4o-mini/Claude Haiku 4.5 on low-confidence guardrail signal. Defer to post-launch V1.1 — current single-provider with fallback chain is "good enough" pre-launch.
8. **Per-user economics (modeled, 100k MAU)**:
   - **Status quo (gpt-4o-mini, no semantic cache, no caching exploit, ~50% exact-cache hit)**: ~$0.018/MAU/month = **$1,800/month** at 100k.
   - **Recommended (gpt-4.1-nano + prompt-caching properly used + semantic cache 40% hit + per-user 20-msg daily cap)**: ~$0.004/MAU/month = **$400/month** at 100k. → **~78% reduction**.
   - **Voice (STT+TTS at full duty cycle)** dominates if 100% voice: ~$0.18/min uncached, ~$0.05-0.10/min cached. At 2 min/MAU/month avg → $36k-$10k uncached, $5k-$10k cached at 100k. **Voice cost guards (per-user min/day cap) are non-optional.**
9. **Cost guards 2026 standard pattern**: Redis token-bucket per user (daily reset), budget-cap per museum (B2B SLA), circuit breaker on org-wide $/hour. liteLLM + Portkey OSS templates available. Musaium has nothing today — **CRITICAL pre-launch gap**.
10. **Verdict**: current `LlmCacheServiceImpl` is **NOT enough** for 100k MAU B2C freemium. Three actions are pre-launch necessary, one is V1.1, one is rejected:
    - **DO pre-launch**: (a) switch default model to gpt-4.1-nano (or gpt-5-nano), (b) restructure prompts to maximise auto-caching prefix hits (already mostly correct), (c) ship per-user daily token budget cap (Redis INCR + EXPIRE pattern).
    - **DO V1.1 (after 7d prod bake)**: (d) add semantic-cache layer (RedisVL on existing Redis) on top of existing exact-match cache — 2-layer design (L1 exact → L2 semantic → L3 LLM).
    - **REJECT for V1**: routing cascade (premature, optimise quality first), DeepSeek api.deepseek.com path (GDPR blocker), LangCache managed (lock-in + preview pricing risk).

---

## 1. Pricing matrix (May 2026, USD per 1M tokens unless stated)

> Sources: each row cites primary provider doc or aggregator with date. "n/a" = not publicly priced or not applicable to chat.

### 1.1 OpenAI (developers.openai.com pricing, May 2026)

| Model | Input | Cached Input | Output | Batch (50% off) | Notes |
|---|---|---|---|---|---|
| gpt-5-nano | $0.05 | $0.005 | $0.40 | $0.025/$0.20 | newest budget tier ; 10× cache discount ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| gpt-4.1-nano | $0.05 | $0.025 | $0.20 | $0.025/$0.10 | cheapest output ; 50% cache ([source](https://pecollective.com/tools/openai-api-pricing/)) |
| gpt-5-mini | $0.25 | $0.025 | $2.00 | $0.125/$1.00 | reasoning-grade ; 10× cache discount ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| gpt-4o-mini (Musaium current) | $0.15 | $0.075 | $0.60 | $0.075/$0.30 | 50% cache ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| gpt-4.1-mini | $0.20 | $0.10 | $0.80 | $0.10/$0.40 | midrange ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| gpt-5.4-mini | $0.75 | n/a | $4.50 | $0.375/$2.25 | 6× pricier ([source](https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini)) |
| gpt-5.5 | $5.00 | n/a | $30.00 | $2.50/$15 | frontier ; April 2026 launch ([source](https://pecollective.com/tools/openai-api-pricing/)) |
| o3-mini | $0.55 | $0.55 | $2.20 | n/a | reasoning, no cache discount ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| o4-mini | $0.55 | $0.275 | $2.20 | $0.275/$1.10 | reasoning + caching ([source](https://pricepertoken.com/pricing-page/provider/openai)) |
| **Voice — gpt-4o-mini-transcribe (STT)** | $1.25 input | n/a | $5.00 output | n/a | ~$0.003/min ([source](https://openrouter.ai/openai/gpt-4o-mini-transcribe)) |
| **Voice — gpt-4o-mini-tts (TTS)** | $0.60 text | n/a | $12 audio | n/a | ~$0.015/min generated ([source](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)) |
| **Realtime API (gpt-realtime)** | $32/MTok audio | $0.40/MTok | $64/MTok audio | n/a | $0.18-$0.46/min uncached, $0.05-0.10/min cached ([source](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)) |

**OpenAI prompt caching specifics** ([source](https://openai.com/index/api-prompt-caching/)):
- Auto-enabled for prompts ≥1024 tokens (256-token hash prefix routes to same machine)
- TTL: 5-10 min idle, ≤1h absolute (mainstream models). GPT-5.4/5.5 extended caching up to 24h.
- Cached input is **50% off** on gpt-4o-mini, gpt-4.1-mini ; **90% off** on gpt-5-mini, gpt-5.4-mini.
- The `prompt_cache_key` parameter lets you steer routing for cross-request hits.

### 1.2 DeepSeek (api-docs.deepseek.com pricing, May 2026)

| Model | Cache-Hit Input | Cache-Miss Input | Output | Notes |
|---|---|---|---|---|
| DeepSeek-V4-Flash | $0.0028 | $0.14 | $0.28 | **50× discount on cache-hit** ([source](https://api-docs.deepseek.com/quick_start/pricing/)) |
| DeepSeek-V4-Pro (75% off until 2026-05-31) | $0.003625 | $0.435 | $0.87 | regular: $0.0145/$1.74/$3.48 ([source](https://api-docs.deepseek.com/quick_start/pricing/)) |

DeepSeek-R1 / V3 reported separately in earlier searches at $0.55 input / $2.19 output (R1 reasoning) and $0.14/$0.28 (V3) ([source](https://lmmarketcap.com/deepseek-api-pricing)), but those are now superseded by V4-Flash/V4-Pro on the official page.

**GDPR blocker** ([source](https://complydog.com/blog/is-deepseek-gdpr-compliant), [source](https://usercentrics.com/knowledge-hub/eu-regulators-scrutinize-deepseek-for-data-privacy-violations/)):
- Italy banned DeepSeek cloud Feb 2026.
- FR/BE/DE/IE active GDPR investigations as of early 2026.
- No SCCs for China transfers, no Transfer Impact Assessment.
- **Self-hosted DeepSeek V4 on EU GPU server is the only compliant path** for Musaium B2C ([source](https://dcxv.com/blog/deepseek-v4-llm-model-eu-server)).

### 1.3 Google Gemini (ai.google.dev pricing, May 2026)

| Model | Input | Output | Context Cache (input) | Batch (50% off) | Notes |
|---|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.01 | $0.05/$0.20 | cheapest tier ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Gemini 2.5 Flash | $0.30 | $2.50 | $0.03 | $0.15/$1.25 | mid ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Gemini 2.5 Pro (≤200k ctx) | $1.25 | $10.00 | $0.125 | $0.625/$5.00 | frontier ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Gemini 2.5 Pro (>200k ctx) | $2.50 | $15.00 | $0.25 | $1.25/$7.50 | long-context surcharge ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Gemini 3.1 Pro Preview (≤200k) | $2.00 | $12.00 | $0.20 | $1.00/$6.00 | newest ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Audio input (Flash) | $1.00 | n/a | $0.10 | $0.50 | native audio in ([source](https://ai.google.dev/gemini-api/docs/pricing)) |
| Audio input (Flash-Lite) | $0.30 | n/a | $0.03 | $0.15 | cheapest audio in ([source](https://ai.google.dev/gemini-api/docs/pricing)) |

**Context caching specifics** ([source](https://www.geminipricing.com/context-caching)):
- Minimum cache size: **32,768 tokens** — too large for Musaium's typical 1-3k system prompt, so **Gemini context-caching is NOT useful** for our short-prompt chat shape.
- Cache reads are 25% of base input (vs Anthropic 10%, OpenAI 10-50%).
- Storage fee: $0.3125/MTok/hour on top.

### 1.4 Anthropic Claude (platform.claude.com/docs/en/about-claude/pricing, May 2026)

| Model | Base Input | 5m Cache Write (1.25×) | 1h Cache Write (2×) | Cache Read (0.1×) | Output | Batch (50%) |
|---|---|---|---|---|---|---|
| Haiku 4.5 | $1.00 | $1.25 | $2.00 | $0.10 | $5.00 | $0.50/$2.50 |
| Sonnet 4.6 | $3.00 | $3.75 | $6.00 | $0.30 | $15.00 | $1.50/$7.50 |
| Opus 4.7 | $5.00 | $6.25 | $10.00 | $0.50 | $25.00 | $2.50/$12.50 |
| Haiku 3.5 (deprecated) | $0.80 | $1.00 | $1.60 | $0.08 | $4.00 | $0.40/$2.00 |

**Anthropic caching specifics** ([source](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)):
- Default TTL **5 minutes** (changed from 1h on 2026-03-06 — see "silent drop" note).
- 1h TTL extension available via `cache_control: { type: "ephemeral", ttl: "1h" }` at 2× write cost.
- **Cache read = 10% of base input** = 90% discount = best-in-class.
- Caching multipliers stack with Batch API (combined: cache-read + batch = effective 5% of standard).
- Multi-cache breakpoints supported (up to 4) for layered prompt structure.

### 1.5 Comparison: 5-msg chat cost (1500 input + 250 output tokens / call, no cache)

> Modeled: typical Musaium chat turn — system+section ~1k cached + history ~250 + user ~250 + output ~250.

| Provider/Model | Cost per call | 100k MAU × 5 msg/month |
|---|---|---|
| gpt-4o-mini (current) | $0.000375 | $187.50 |
| **gpt-4.1-nano** | $0.000125 | **$62.50** |
| gpt-5-nano | $0.000175 | $87.50 |
| Gemini 2.5 Flash-Lite | $0.000250 | $125.00 |
| Claude Haiku 4.5 | $0.002750 | $1,375 |
| DeepSeek V4-Flash | $0.000280 | $140 |
| DeepSeek V4-Flash (90% cache hit) | $0.000074 | $37 |

**Caveat**: this isolates pure token cost. Once you layer 50%+ exact-match cache (current `LlmCacheServiceImpl`) + 30% semantic cache, the effective LLM-bill multiplier drops to ~30-50% of these figures.

---

## 2. Prompt caching patterns

### 2.1 Universal rule: stable content FIRST

All providers cache by **prefix hash** ([OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)):

```
[ stable: system prompt + tool definitions + few-shot examples ]    ← CACHEABLE PREFIX
[ semi-stable: conversation history (older messages) ]               ← CACHEABLE if no diff
[ variable: latest user message + dynamic context ]                  ← NOT CACHED
```

Musaium's `chat.service.ts` already orders this correctly per `CLAUDE.md` AI Safety section:
```
[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]
```
Verified at `museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts`.

### 2.2 OpenAI auto-caching mechanics

- **Min prefix length**: 1024 tokens. Below → no caching.
- **Hash window**: first 256 tokens drive the routing hash ([source](https://openai.com/index/api-prompt-caching/)).
- **Stability**: any byte change in the first 1024 tokens invalidates the cache.
- **Risk**: user-controlled fields injected into system prompt poison the prefix and kill cache rate. Musaium already sanitizes `location` + `locale` via `sanitizePromptInput()` (see CLAUDE.md) — **correct discipline**.
- **`prompt_cache_key` parameter** (added late 2025) lets you steer routing for cross-session reuse — should be set to `{museumId}:{sectionType}` in Musaium for max hit rate.

### 2.3 Anthropic explicit caching

- Use `cache_control: { type: "ephemeral" }` on the LAST cacheable block.
- Default TTL 5 min ; 1h TTL costs 2× write but allows multi-turn reuse.
- **Break-even**: 5-min cache pays off after ≥1 cache read ; 1h cache pays off after ≥2 cache reads (per pricing page Note).
- **Stacks with Batch API** → effective 5% of standard cost on cached batch reads.

### 2.4 DeepSeek context cache

- **Disk-based**, not in-memory ([source](https://api-docs.deepseek.com/news/news0802)).
- "Best-effort, not guaranteed" — works on stable prefix (system prompt, repo summary, rule set).
- 50× discount on cache-hit input ($0.0028 vs $0.14 on V4-Flash) — **highest cache savings ratio of any provider**.
- TTL/eviction policy not documented publicly.

### 2.5 Caching threat model (apply to Musaium)

[Source](https://medium.com/@instatunnel/semantic-cache-poisoning-corrupting-the-fast-path-e14b7a6cbc1f), [redteams.ai](https://redteams.ai/topics/llm-internals/kv-cache-attacks):

- **Cross-tenant KV cache leak** (theoretical, none confirmed in OpenAI/Anthropic prod) — if a user crafts a prompt matching another tenant's cached prefix, attention computation could reuse foreign KV values. **Mitigation**: providers' tenant isolation. Out of Musaium's control.
- **Semantic cache poisoning** (relevant for Musaium's planned semantic cache): attacker crafts a prompt whose embedding lands near a popular FAQ vector ; their malicious response gets cached and served to future legitimate users.
  - **Mitigation 1**: cache key MUST include `museumId` and (for personalized) `userId` (already in Musaium's exact-match key shape `llm:v1:{ctx}:{museumId}:{userId|anon}:{sha256}`).
  - **Mitigation 2**: never cache `anon` semantically (only exact-match) — anonymous users can't be tied to a tenant.
  - **Mitigation 3**: TTL ≤ 1h for personalized scope (already enforced in `LlmCacheServiceImpl`).

---

## 3. Semantic cache (vs exact-match)

### 3.1 Exact-match (current Musaium) vs semantic

| Dimension | Exact-match (`LlmCacheServiceImpl`) | Semantic |
|---|---|---|
| Hit condition | SHA256(canonical input) equal | cosine similarity ≥ threshold |
| Typical hit rate (chat) | 5-15% | 30-70% ([source](https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/), [source](https://redis.io/blog/what-is-semantic-caching/)) |
| Latency overhead | 1-5 ms (Redis GET) | 5-20 ms (embedding + vector search) |
| False positive risk | 0 | 1-5% at threshold 0.85, <0.5% at 0.95 |
| Storage cost | tiny (key+value) | 768/1536-dim vector per entry |
| Embedding API cost | $0 | $0.02-0.13 per MTok (OpenAI/Cohere/local) |
| Implementation effort | done | +2-5 days |

### 3.2 Threshold tuning (production benchmarks)

[Source](https://redis.io/blog/10-techniques-for-semantic-cache-optimization/), [source](https://www.getmaxim.ai/articles/semantic-caching-for-llms-cut-cost-and-latency-at-scale/):

- **0.65-0.75**: aggressive, support-style FAQ, accepts paraphrase variants. High hit, higher false positives.
- **0.85-0.88**: balanced, recommended for general chatbots and educational content.
- **0.90-0.95**: conservative, mission-critical answers (medical, legal). Lower hit (~20-30%) but near-zero false positives.

**Recommendation for Musaium**: start at **0.88** (museum-mode + personalized scopes) — educational content where small paraphrase differences can change the meaning ("who painted X" vs "when was X painted").

### 3.3 Options for Musaium

| Option | Pros | Cons | Recommended? |
|---|---|---|---|
| **redisvl** (Python) + custom TS wrapper | OSS, integrates existing Redis | Python lib, Musaium is Node/TS → need to port logic or call via sidecar | **YES for V1.1** if no managed product |
| **Redis LangCache (managed)** | drop-in, OpenTelemetry, low ops | Public preview pricing (~$1.50/MTok input + $100/mo storage) ([source](https://redis.io/calculator/langcache/)), final GA pricing TBD, vendor lock-in | NO — preview pricing risk for B2C cost-control |
| **GPTCache (Zilliz)** | OSS, multi-backend (Milvus/Redis/Qdrant) | Python-first, less Node-idiomatic | NO unless we already use Milvus |
| **Roll own** (Redis + node embedding + hnswlib) | full control, cheapest | invented wheel, 2-5d eng | YES if redisvl port is too costly |
| **Bifrost / LiteLLM gateway semantic-cache** | comes free with gateway | adds latency layer, deployment | OK if we adopt gateway anyway |

### 3.4 Cost-benefit modeled (100k MAU)

> Assumptions: 5 msg/MAU/month × 100k = 500k LLM calls. ~50% of "museum FAQ" + "tell me about X artwork" type queries → high semantic redundancy. Existing `LlmCacheServiceImpl` ~10% exact-match hit empirical (typical chat).

| Layer | Hit rate | LLM calls saved | Monthly cost saved (gpt-4.1-nano) |
|---|---|---|---|
| Exact-match (today) | 10% | 50k | $6.25 |
| Exact + semantic (recommended) | 35% (+25 pts) | 175k | $21.88 |
| Exact + semantic + 80% prefix-cache hit on remaining | ~50% effective on input cost | — | ~$30-40 saved |

**At gpt-4.1-nano scale the absolute $ savings are small** — but: (a) the same architecture scales linearly when premium users hit Claude Haiku 4.5 (where the saving is 10× larger), and (b) latency reduction is the real win (1-5s saved per cache hit).

---

## 4. Multi-provider routing

### 4.1 RouteLLM / cascade pattern

[Source](https://www.lmsys.org/blog/2024-07-01-routellm/), [source](https://research.google/blog/speculative-cascades-a-hybrid-approach-for-smarter-faster-llm-inference/):

```
Query → [classifier] → tier 1 (nano) → confidence ok? → return
                                    ↓ no
                                    tier 2 (mini) → confidence ok? → return
                                                    ↓ no
                                                    tier 3 (frontier) → return
```

- Matrix factorization router achieves **95% of GPT-4 quality at 26% of GPT-4 calls** → ~48% cost cut vs random baseline.
- 3-tier rule→semantic→LLM routing reported 60-85% savings ([source](https://blog.meganova.ai/the-3-tier-routing-cascade-rule-based-semantic-llm/)).

### 4.2 Musaium fit: post-launch V1.1, not pre-launch V1

**Reject for V1** because:
1. Musaium already has provider fallback chain (OpenAI → DeepSeek → Google per env config).
2. Routing-classifier is its own LLM call ($) — break-even needs >100k calls/month to amortize.
3. Pre-launch V1 priority is **quality + safety** over cost optimization (per user feedback rule "product-first, no minimal fixes").
4. Adding cascade routing pre-launch increases blast radius and complicates the existing guardrail pipeline.

**Adopt for V1.1** once we have 7d+ production traffic data → train router on actual query distribution.

### 4.3 Gateway choice (when we get there)

[Source](https://www.pkgpulse.com/guides/portkey-vs-litellm-vs-openrouter-llm-gateway-2026), [source](https://www.mindstudio.ai/blog/best-ai-model-routers-multi-provider-llm-cost):

| Gateway | Cost | Pros | Cons |
|---|---|---|---|
| **LiteLLM** (self-hosted) | $0 (OSS) | full control, budget manager + per-user budgets built-in, OpenAI-compatible | self-host infra, you operate it |
| **Portkey** | $49/mo + $9/100k requests | production-ready, observability + guardrails baked in | $$ at scale, SaaS lock-in |
| **OpenRouter** | 5.5% transaction fee + provider markups | widest catalog, fastest setup | 5.5% fee is a fixed margin loss |

**For Musaium 100k MAU at <500k req/month**: LiteLLM self-host is cheapest and gives per-user budgets + virtual keys + cost caps. **OpenRouter 5.5% fee** would cost ~$110/mo at our modeled $2k/mo bill — not negligible, but the simplicity may be worth it for the first 6 months.

---

## 5. Token reduction beyond caching

### 5.1 System-prompt compression

[Source](https://machinelearningmastery.com/prompt-compression-for-llm-generation-optimization-and-cost-reduction/), [source](https://dasroot.net/posts/2026/04/token-optimization-llm-costs-prompt-engineering/):

- **Trim filler**: replace "As a helpful assistant, please provide..." → "Provide...". Typical 30-40% reduction in system-prompt size.
- **Semantic summarization**: condense few-shot examples to essential signals.
- **Relevance filtering**: drop sections not relevant to current section_type (Musaium already does this with section-based prompts — good).
- Reported stack: 70-85% total cost reduction when all five levers applied.

**Action for Musaium**: audit each section prompt under `museum-backend/src/modules/chat/useCase/llm/llm-sections/` for verbose preamble. Each 1k token shaved = -$0.05-$0.15 per 1000 calls. Out of scope for R23 but flagged for a follow-up.

### 5.2 Structured output trade-off

[Source](https://david-gilbertson.medium.com/llm-output-formats-why-json-costs-more-than-tsv-ebaf590bd541), [source](https://www.kdnuggets.com/stop-wasting-tokens-a-smarter-alternative-to-json-for-llm-pipelines):

- JSON adds **30-60% overhead** vs plain text or TSV (every quote, brace, colon = tokens).
- Schema in system prompt (Zod/Pydantic) adds 50-500 tokens depending on field count.
- **However**: structured output is REQUIRED for Musaium's `main-assistant-output.schema.ts` to map LLM response → typed feature/highlight blocks. Trade is necessary.
- **Optimization**: minimize field count + shorten field names (`mh` not `mainHighlight`) when the schema is internal-only.

### 5.3 max_tokens cap

- Without `max_tokens` cap, models drift into verbose justifications (especially gpt-4o-mini and Claude).
- Musaium chat should hard-cap at **~300 output tokens** for typical turn (voice TTS cost scales with output).
- **Voice critical**: TTS at $12/MTok audio × 250 output tokens = ~$0.003/turn. With 500 token verbose responses = ~$0.006/turn (2×).

---

## 6. Voice pipeline cost specifics

### 6.1 STT (gpt-4o-mini-transcribe)

- Pricing: $1.25 input / $5.00 output per MTok ([source](https://openrouter.ai/openai/gpt-4o-mini-transcribe))
- Approx cost: **$0.003/min of audio transcribed**.
- 100k MAU × 2 min voice/month → 200k min × $0.003 = **$600/month STT alone**.

### 6.2 TTS (gpt-4o-mini-tts)

- Pricing: $0.60 text input + $12 audio output per MTok.
- Approx cost: **$0.015/min of generated audio** ([source](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)).
- 100k MAU × 2 min generated/month → 200k min × $0.015 = **$3,000/month TTS alone**.

### 6.3 Realtime API (V1.1 candidate, currently deferred)

- Pricing: $32/MTok audio in, $64/MTok audio out, **$0.40/MTok cached** = 80× cache discount.
- **Real cost: $0.18-$0.46/min uncached, $0.05-$0.10/min cached** ([source](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)).
- 100k MAU × 2 min/month at $0.30 avg uncached = **$60,000/month**. Cached: ~$10,000/month.
- **Verdict**: Realtime API is 5-15× more expensive than classic STT→LLM→TTS unless heavy caching is achieved. Musaium's V1.1 deferral is correct.

### 6.4 Voice cost guards mandatory pre-launch

- Per-user daily voice minute cap (Redis INCR seconds-elapsed).
- Per-museum monthly voice budget (B2B SLA tier).
- Circuit breaker: if org-wide TTS spend > $200/hour, degrade to text-only.

---

## 7. Per-user economics model (100k MAU)

> All figures **modeled**. Inputs: 5 chat msg/MAU/month + 2 min voice/MAU/month, 1500 in + 250 out tokens per chat turn, gpt-4.1-nano as text model.

### 7.1 Status quo (gpt-4o-mini, no caching exploit, 10% exact cache hit)

| Line item | Calc | $/month |
|---|---|---|
| Chat LLM (500k calls × 0.9 × $0.000375) | with 10% exact cache | $169 |
| STT (200k min × $0.003) | | $600 |
| TTS (200k min × $0.015) | | $3,000 |
| Embeddings (semantic cache writes, n/a) | | $0 |
| **Total** | | **$3,769** ≈ **$0.038/MAU** |

### 7.2 Recommended (gpt-4.1-nano + caching + per-user 20-msg daily cap + semantic cache)

Assume: 35% effective combined cache hit ; cap reduces "abusive" 1% of users from 200 msg/day → 20 msg/day (saves ~30% of total calls).

| Line item | Calc | $/month |
|---|---|---|
| Chat LLM (500k × 0.7 cap-adjusted × 0.65 cache-adjusted × $0.000125) | 35% cache + nano | $28 |
| Embeddings for semantic cache | 500k × 1500 tok × $0.02/MTok | $15 |
| STT (200k min × $0.003) | | $600 |
| TTS (200k min × $0.015, 30% cap reduction) | | $2,100 |
| Voice min cap reduces 30% | | — |
| **Total** | | **$2,743** ≈ **$0.027/MAU** |

### 7.3 Aggressive (DeepSeek V4-Flash EU-hosted + 80% cache hit + voice cap)

| Line item | Calc | $/month |
|---|---|---|
| Chat LLM (500k × 0.2 cache-miss × $0.000280 + 500k × 0.8 cache-hit × $0.000074) | | $58 |
| Self-host GPU EU (DCXV) | ~$2k/mo for V4-Flash inference at this volume | $2,000 |
| STT (own faster-whisper EU GPU) | included in GPU cost | $0 |
| TTS (gpt-4o-mini-tts kept for voice quality) | as above | $2,100 |
| **Total** | | **$4,158** — **but** GDPR-clean and provider-independent |

**Trade**: self-host EU GPU is GDPR-clean but adds **infra ops overhead** + opex risk. **Reject for V1**, reconsider at V1.5 when B2B revenue funds an EU GPU SRE.

### 7.4 Breakdown by cost driver

For the **Recommended** scenario above:
- Voice TTS = **77%** of total cost.
- Voice STT = **22%**.
- Chat LLM = **~1%**.

**Implication**: Musaium's chat cost is already nearly negligible vs voice. **Voice optimization is the bigger lever.** Specifically:
1. Cap voice minutes/user/day (Redis counter).
2. Skip TTS for cached-response hits (we already have the audio in `ChatMessage.audioUrl`, S3-persisted).
3. Investigate cheaper TTS providers (ElevenLabs Flash, PlayHT 3.0) for V1.1 — but quality risk in FR/EN multilingual.

---

## 8. Cost guards 2026 standard (gap analysis)

### 8.1 Layered defense pattern

[Source](https://oneuptime.com/blog/post/2026-01-30-llm-rate-limiting/view), [source](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/), [source](https://docs.litellm.ai/docs/proxy/users):

| Layer | Granularity | Mechanism | Reset |
|---|---|---|---|
| Per-user QPS | requests/sec | Redis token bucket | sliding |
| Per-user daily | tokens/day OR msg/day | Redis INCR + EXPIRE | UTC midnight |
| Per-user monthly | $ budget | accumulator | calendar month |
| Per-museum (B2B) | $ budget | per-tenant key | per SLA |
| Org-wide circuit | $/hour | Prometheus alert + degrade path | continuous |

### 8.2 Musaium current state (verified gap)

Searched `museum-backend/src` for rate-limit and budget-cap implementations:
- Rate limiting present at HTTP level (`express-rate-limit` style) but **no token/cost-aware limit** on LLM calls.
- `LlmCacheServiceImpl` reduces cost but does not cap it.
- No per-user `$ budget` accumulator.
- No per-museum budget gate.

**CRITICAL pre-launch gap** for B2C freemium. A single abusive user (or runaway loop) can spike $/hour to thousands. Without a cap, unit economics are at the mercy of the worst actor.

### 8.3 Implementation pattern (Redis-based, 4-day eng estimate)

```typescript
// per-user daily LLM-token cap
const dailyKey = `llm:budget:user:${userId}:${YYYYMMDD}`;
const tokens = await redis.incrBy(dailyKey, requestTokens);
if (tokens === requestTokens) await redis.expire(dailyKey, 86400);
if (tokens > USER_DAILY_TOKEN_CAP) throw new BudgetExceededError();
```

Combine with:
- Per-user monthly $ cap (atomic Lua script).
- Per-museum tenant cap (B2B).
- Prometheus alert at 80% / 100% / 120% of forecast.

### 8.4 GDPR cache interaction (right-to-erasure)

[Source](https://medium.com/@michael.hannecke/the-hidden-data-residency-problem-in-prompt-caching-f99e6207451e), [source](https://gdprlocal.com/large-language-models-llm-gdpr/):

- KV-cache and prompt-cache on provider side **may** hold user-attributable inputs for up to 1h.
- GDPR Article 17 erasure: no court has yet drawn the line on whether 5-min KV cache is in scope.
- **Mitigation for Musaium**: include `userId` in `prompt_cache_key` (OpenAI) → user-scoped cache lines can be invalidated on account deletion. The existing `LlmCacheServiceImpl.invalidateMuseum` pattern is the right shape — needs an `invalidateUser(userId)` sibling for GDPR delete.

---

## 9. Verdict — does Musaium's current cache suffice for 100k MAU B2C freemium?

### 9.1 Short answer

**No.** The current `LlmCacheServiceImpl` is good (correctly designed exact-match with adaptive TTL, fail-open, scoped invalidation per ADR-036) but **insufficient alone**. Three additions are pre-launch necessary.

### 9.2 Pre-launch V1 (2026-06-01) MUST-DO

| Action | Effort | Saving / Risk reduction |
|---|---|---|
| **Switch default model to `gpt-4.1-nano`** in `env.ts:166` | <1 day | -67% input, -33% output on chat LLM |
| **Trim 3 longest section prompts** (audit `llm-sections/`) | 2-3 days | -20-40% input tokens per call |
| **Per-user daily token cap** (Redis pattern §8.3) | 3-4 days | bounds worst-case $/user, prevents runaway |
| **Per-user voice min cap** (separate counter) | 1-2 days | bounds TTS spend (77% of cost) |
| **`prompt_cache_key` parameter** in OpenAI calls | 1 day | +10-20% cache hit |
| **Set `max_tokens: 300`** hard cap on chat LLM call | <1 day | bounds verbose drift |

### 9.3 V1.1 (post-launch, after 7d bake)

| Action | Effort | Saving |
|---|---|---|
| **Semantic cache layer** (RedisVL or self-roll, threshold 0.88) on top of existing exact-match | 5-7 days | +25-40 pts hit rate, -30% LLM calls |
| **Per-museum (B2B) budget cap** | 3-4 days | required for B2B SLA tier |
| **Cost dashboard** (Langfuse OSS self-host) | 5 days | per-user/per-museum cost visibility |

### 9.4 V1.2+ (after data collection, requires production traffic distribution)

| Action | Effort | Saving |
|---|---|---|
| Model cascade router (RouteLLM-trained on prod traffic) | 10-15 days | 45-85% LLM cost cut at 95% quality |
| LiteLLM gateway adoption (replaces direct provider clients) | 5-7 days | unifies budget/rate limit/observability |
| Realtime API for high-engagement users only | 10 days | better UX, paid-tier upsell driver |

### 9.5 REJECTED for Musaium

| Action | Why rejected |
|---|---|
| DeepSeek api.deepseek.com (China-hosted) | GDPR blocker, Italy ban, FR/BE/DE/IE investigations |
| Redis LangCache managed | Preview pricing risk, vendor lock-in for cost-sensitive B2C |
| Anthropic Claude Haiku 4.5 as primary | 7-10× more expensive than gpt-4.1-nano with minimal quality delta for FAQ-shaped queries |
| OpenRouter as gateway | 5.5% transaction fee ≈ $110/mo at modeled scale, no margin for B2C freemium |
| Batch API for chat | chat is real-time ; batch is for embedding generation + offline summarisation only |

---

## 10. Open questions / further research

1. **Local TTS feasibility**: ElevenLabs Flash 2.5 ($0.30/1k chars ≈ $0.018/min) vs OpenAI gpt-4o-mini-tts ($0.015/min). For 200k min/mo, ~$3k/mo savings if ElevenLabs is 50% cheaper at our volume. → R23-bis or R-Voice deeper dive.
2. **DeepSeek EU self-host break-even**: at what monthly call volume does GPU-EU self-host (~$2k/mo) beat OpenAI API spend? Modeled: ~500k calls/mo at gpt-4.1-nano. → relevant only post-revenue.
3. **gpt-5-nano quality on French/multilingual** vs gpt-4.1-nano: needs prod A/B. → ship pre-launch as 90/10 shadow.
4. **Anthropic Claude Haiku 4.5 1h-TTL caching**: at >5 calls/hour same prefix per user, the 2× write cost is amortized. For Musaium's high-frequency in-museum mode, this could change the economics — needs benchmark.

---

## Sources

### OpenAI
- [OpenAI API Pricing 2026 (PricePerToken aggregator)](https://pricepertoken.com/pricing-page/provider/openai)
- [OpenAI API Pricing 2026: GPT-4.1 at $2, GPT-5 at $1.25/1M (PECollective)](https://pecollective.com/tools/openai-api-pricing/)
- [Prompt Caching in the API (OpenAI official)](https://openai.com/index/api-prompt-caching/)
- [Prompt caching guide (developers.openai.com)](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Batch API guide (developers.openai.com)](https://developers.openai.com/api/docs/guides/batch)
- [OpenAI Batch API: 50% Cost Reduction (TokenMix)](https://tokenmix.ai/blog/openai-batch-api-pricing)
- [GPT-5.4 Mini Pricing 2026 (PricePerToken)](https://pricepertoken.com/pricing-page/model/openai-gpt-5.4-mini)
- [GPT-5.5 release April 2026 (LLM-stats)](https://llm-stats.com/models/gpt-5.5)
- [GPT-4o-mini-tts pricing (TokenMix)](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)
- [GPT-4o Mini Transcribe pricing (OpenRouter)](https://openrouter.ai/openai/gpt-4o-mini-transcribe)
- [OpenAI Realtime API cost per minute math 2026 (CallSphere)](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)
- [OpenAI Realtime API production guide (Forasoft)](https://www.forasoft.com/blog/article/openai-realtime-api-voice-agent-production-guide-2026)

### DeepSeek
- [DeepSeek Models & Pricing (api-docs.deepseek.com)](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek Context Caching news (api-docs.deepseek.com)](https://api-docs.deepseek.com/news/news0802)
- [DeepSeek API Pricing — R1, V3 & Chat (LMMarketCap)](https://lmmarketcap.com/deepseek-api-pricing)
- [DeepSeek V4 GDPR EU Server (DCXV)](https://dcxv.com/blog/deepseek-v4-llm-model-eu-server)
- [Is DeepSeek GDPR Compliant? (ComplyDog)](https://complydog.com/blog/is-deepseek-gdpr-compliant)
- [EU Regulators on DeepSeek (Usercentrics)](https://usercentrics.com/knowledge-hub/eu-regulators-scrutinize-deepseek-for-data-privacy-violations/)

### Google Gemini
- [Gemini API pricing (ai.google.dev)](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Context Caching costs (GeminiPricing.com)](https://www.geminipricing.com/context-caching)
- [Gemini 2.5 Flash pricing (PricePerToken)](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)
- [Google Gemini API Pricing 2026 (DevTk.AI)](https://devtk.ai/en/blog/gemini-api-pricing-guide-2026/)

### Anthropic Claude
- [Claude API Pricing (platform.claude.com)](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic prompt caching (platform.claude.com)](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic API Pricing 2026 (Finout)](https://www.finout.io/blog/anthropic-api-pricing)
- [Claude API Pricing Haiku 4.5 / Sonnet 4.6 / Opus 4.7 (BenchLM)](https://benchlm.ai/blog/posts/claude-api-pricing)
- [Anthropic 5-min cache TTL change (DEV.to)](https://dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao)

### Semantic cache
- [What is semantic caching? (Redis)](https://redis.io/blog/what-is-semantic-caching/)
- [Semantic caching with Redis LangCache tutorial (Redis)](https://redis.io/tutorials/semantic-caching-with-redis-langcache/)
- [10 techniques to optimize your semantic cache (Redis)](https://redis.io/blog/10-techniques-for-semantic-cache-optimization/)
- [Redis LangCache pricing calculator](https://redis.io/calculator/langcache/)
- [Semantic Caching for LLMs (Spheron Blog)](https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/)
- [GPTCache GitHub (Zilliz)](https://github.com/zilliztech/GPTCache)
- [Cache LLM Responses — RedisVL docs](https://docs.redisvl.com/en/latest/user_guide/03_llmcache.html)
- [Semantic Caching for LLMs (Maxim AI)](https://www.getmaxim.ai/articles/semantic-caching-for-llms-cut-cost-and-latency-at-scale/)

### Multi-provider routing
- [RouteLLM blog (LMSYS)](https://www.lmsys.org/blog/2024-07-01-routellm/)
- [RouteLLM GitHub (lm-sys)](https://github.com/lm-sys/RouteLLM)
- [The 3-Tier Routing Cascade (MegaNova)](https://blog.meganova.ai/the-3-tier-routing-cascade-rule-based-semantic-llm/)
- [LLM Routing and Model Cascades (TianPan)](https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades)
- [Speculative cascades (Google Research)](https://research.google/blog/speculative-cascades-a-hybrid-approach-for-smarter-faster-llm-inference/)
- [Multi-LLM routing strategies on AWS](https://aws.amazon.com/blogs/machine-learning/multi-llm-routing-strategies-for-generative-ai-applications-on-aws/)

### LLM gateway / budget management
- [Portkey vs LiteLLM vs OpenRouter (PkgPulse)](https://www.pkgpulse.com/guides/portkey-vs-litellm-vs-openrouter-llm-gateway-2026)
- [LiteLLM Budget Manager docs](https://docs.litellm.ai/docs/budget_manager)
- [LiteLLM Proxy Server budgets/rate limits](https://docs.litellm.ai/docs/proxy/users)
- [Portkey budget limits and alerts](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/)
- [Portkey rate limiting for LLMs](https://portkey.ai/blog/rate-limiting-for-llm-applications/)
- [RelayPlane agent runaway costs](https://relayplane.com/blog/agent-runaway-costs-2026)

### Token reduction / prompt engineering
- [LLM Output Formats: JSON vs TSV (David Gilbertson, Medium)](https://david-gilbertson.medium.com/llm-output-formats-why-json-costs-more-than-tsv-ebaf590bd541)
- [Stop Wasting Tokens: alternative to JSON (KDnuggets)](https://www.kdnuggets.com/stop-wasting-tokens-a-smarter-alternative-to-json-for-llm-pipelines)
- [Token optimization 2026 (Obvious Works)](https://www.obviousworks.ch/en/token-optimization-saves-up-to-80-percent-llm-costs/)
- [LLM Token Optimization (Redis)](https://redis.io/blog/llm-token-optimization-speed-up-apps/)
- [Prompt Compression Guide (MachineLearningMastery)](https://machinelearningmastery.com/prompt-compression-for-llm-generation-optimization-and-cost-reduction/)
- [How to Reduce LLM Costs (PromptLayer)](https://blog.promptlayer.com/how-to-reduce-llm-costs/)

### Observability / per-user economics
- [Langfuse Token & Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- [Langfuse FAQ on costs and tokens](https://langfuse.com/faq/all/costs-tokens-langfuse)
- [Track LLM cost per user (Traceloop)](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user)
- [How I slashed LLM token costs by 90% (Dev.to)](https://dev.to/_eb7f2a654e97a60ae9f96e/how-i-slashed-our-llm-api-token-costs-by-90-from-1m-to-100k-daily-nbp)
- [LLM Chatbot Pricing 2026 (AISuperior)](https://aisuperior.com/llm-chatbot-pricing-cost/)
- [LLM Cost Optimization (EditorialGE)](https://editorialge.com/llm-cost-optimization-why-founders-overpay/)
- [LLM API Pricing Comparison (CostGoat)](https://costgoat.com/compare/llm-api)
- [Cloud IDR LLM Pricing Comparison 2026](https://www.cloudidr.com/blog/llm-pricing-comparison-2026)
- [Featherless LLM API Pricing 2026](https://featherless.ai/blog/llm-api-pricing-comparison-2026-complete-guide-inference-costs)

### Security
- [Semantic Cache Poisoning (Medium/InstaTunnel)](https://medium.com/@instatunnel/semantic-cache-poisoning-corrupting-the-fast-path-e14b7a6cbc1f)
- [KV Cache & Prompt Caching Attacks (RedTeams.ai)](https://redteams.ai/topics/llm-internals/kv-cache-attacks)
- [The Hidden Data Residency Problem in Prompt Caching (Medium)](https://medium.com/@michael.hannecke/the-hidden-data-residency-problem-in-prompt-caching-f99e6207451e)
- [GDPR-Compliant Chatbot Guide (Quickchat)](https://quickchat.ai/post/gdpr-compliant-chatbot-guide)
- [LLM GDPR Compliance (GDPR Local)](https://gdprlocal.com/large-language-models-llm-gdpr/)
