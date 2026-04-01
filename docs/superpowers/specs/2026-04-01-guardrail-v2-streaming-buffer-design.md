# Guardrail V2 + Streaming Jitter Buffer

**Date**: 2026-04-01
**Status**: Approved
**Scope**: museum-backend (guardrail + streaming) — no frontend changes

## Problem

The current guardrail produces false positives on legitimate art queries. "Le Radeau de la Méduse" triggers an off-topic redirect because the artwork name contains no generic art keywords. The redirect hint instructs the LLM to refuse, and the `[META]` tag leaks into the displayed response.

Additionally, the streaming pipeline sends tokens to the client with no buffering. LLM token production is bursty (sometimes 5 tokens in rapid succession, then a 200ms gap), causing visible stutter in the chat UI.

## Solution

Two coordinated changes:

1. **Permissive input guardrail** — only hard-block insults and prompt injections. No more redirect hints. The LLM system prompt is the primary art-topic enforcer.
2. **Controlling output guardrail with jitter buffer** — buffer ~100 tokens before streaming to the client. During buffering, run the LLM art-topic classifier. After validation, drain the buffer at a steady rate (~30-40ms per token) to create a smooth typing effect.

## Architecture

### Input Guardrail (Simplified)

**File**: `art-topic-guardrail.ts` — `evaluateUserInputGuardrail()`

The static rules function reduces to:

```
1. Insult keyword    → { allow: false, reason: 'insult' }
2. Injection pattern → { allow: false, reason: 'prompt_injection' }
3. Default           → { allow: true }
```

Removed from input evaluation:
- Greeting detection (was allow — now covered by default allow)
- Short innocuous message check (was allow — now covered by default allow)
- Art keyword check (was allow — now covered by default allow)
- Dynamic art keyword check (no longer needed on input side)
- Off-topic keyword detection + redirect hint
- External action detection + redirect hint
- Follow-up pattern detection
- Classifier invocation on input
- `redirectHint` field on `GuardrailDecision` (removed entirely)

The `GuardrailDecision` type simplifies to:

```typescript
export interface GuardrailDecision {
  allow: boolean;
  reason?: GuardrailBlockReason;
}
```

The `redirectHint` field is removed from the interface, from `prepareMessage()`, and from the orchestrator input.

### Output Guardrail (Buffer + Classifier)

**File**: `chat-message.service.ts` — `createStreamChunkHandler()`

Replaces the current chunk handler with a two-phase system.

#### Phase 1 — Buffering (tokens 0 to ~100)

Tokens from the LLM accumulate in a backend buffer. No SSE events are sent to the client.

During buffering, two checks run:
1. **Keyword check** (synchronous): insults and injection patterns on accumulated text
2. **Classifier check** (async, parallel): the existing `ArtTopicClassifier.isArtRelated()` evaluates the buffered text

The buffer phase ends when BOTH conditions are met:
- At least `BUFFER_TOKEN_THRESHOLD` tokens accumulated (configurable, default 100)
- The classifier has returned a result (or timed out)

**Decision at end of phase 1:**

| Classifier result | Keyword check | Action |
|---|---|---|
| "art" or fail-open | Clean | Release buffer, enter phase 2 |
| "art" or fail-open | Insult/injection | Send `guardrail` SSE event with refusal |
| "not art" | Any | Send `guardrail` SSE event with refusal |

Fail-open: classifier network error or timeout (3s) → treat as "art" (same behavior as today).

#### Phase 2 — Controlled Streaming (Jitter Buffer)

Once the buffer is validated, tokens drain to the client at a steady rate.

**Drain mechanism:**
- A `setInterval` timer fires every `TOKEN_RELEASE_INTERVAL_MS` (configurable, default 35ms)
- Each tick releases one token (or a small group if buffer is large) as an SSE `token` event
- New tokens from the LLM continue to accumulate in the buffer
- If the buffer empties before the LLM sends more tokens, the timer pauses (no empty events)
- If `[META]` is detected in the buffer, all tokens up to the marker are drained, then streaming stops

**Buffer level management:**
- Target buffer level: `BUFFER_TOKEN_THRESHOLD` tokens ahead
- If buffer drops below 20% of threshold: slow release rate to `TOKEN_RELEASE_INTERVAL_MS * 1.5`
- If buffer exceeds 200% of threshold: speed up release rate to `TOKEN_RELEASE_INTERVAL_MS * 0.7`
- This adaptive rate keeps the buffer around the target level

**Continued safety checks during phase 2:**
- Insult/injection keyword check on each new token (fast, synchronous)
- If detected mid-stream: send `guardrail` SSE event, stop streaming
- No art-topic re-check (classifier already validated in phase 1)

### [META] Handling Improvement

The buffer provides more reliable `[META]` stripping:

- **Phase 1**: If `[META]` appears within the first 100 tokens, it means the LLM produced almost no answer. Strip and handle metadata normally.
- **Phase 2**: When `\n[META]` or `[META]` is detected in the buffer, drain all answer tokens up to the marker, then stop. Parse metadata from the remaining buffer content. No risk of `[META]` leaking to the client because tokens are released from a controlled queue, not passed through directly.

### Non-Streaming Path

`postMessage()` (non-streaming) also applies the output guardrail:

- Run the classifier on the full LLM response text
- If "not art" → return refusal
- If "art" or fail-open → return response
- Insult/injection keyword check (same as today)
- No buffering needed (response is already complete)

### Orchestrator Changes

**File**: `langchain.orchestrator.ts`

Remove `redirectHint` from `OrchestratorInput` interface and from prompt construction. The LLM system prompt already contains art-topic scope instructions — the redirect hint was a redundant, error-prone layer.

### Configuration

New constants in `chat-message.service.ts` (or extracted to config):

```typescript
const BUFFER_TOKEN_THRESHOLD = 100;      // tokens to accumulate before streaming
const TOKEN_RELEASE_INTERVAL_MS = 35;    // base drain rate (aligned with frontend 40ms flush)
const CLASSIFIER_TIMEOUT_MS = 3000;      // max wait for classifier during buffer phase
const BUFFER_LOW_WATERMARK = 0.2;        // slow down when buffer < 20% of threshold
const BUFFER_HIGH_WATERMARK = 2.0;       // speed up when buffer > 200% of threshold
```

## Data Flow

```
LLM chunks
    │
    ▼
┌─────────────────────────────┐
│  Token Buffer (backend)     │
│                             │
│  Phase 1: accumulate,       │
│  run classifier + keyword   │
│  check. No SSE output.      │
│                             │
│  Phase 2: drain at steady   │
│  rate via setInterval.      │
│  Keyword check on new       │
│  tokens. [META] detection.  │
└──────────┬──────────────────┘
           │ SSE token events (~35ms interval)
           ▼
┌─────────────────────────────┐
│  Frontend (unchanged)       │
│  40ms flush interval        │
│  Smooth typing effect       │
└─────────────────────────────┘
```

## What Changes

### Files Modified

| File | Change |
|---|---|
| `art-topic-guardrail.ts` | Remove steps 3-8, remove `redirectHint` from interface, simplify `evaluateStaticRules` to insult+injection only, remove `evaluateUserInputGuardrail` classifier/follow-up/greeting logic, keep `evaluateAssistantOutputGuardrail` but simplify (remove keyword-based off-topic blocking, use classifier instead) |
| `chat-message.service.ts` | Rewrite `createStreamChunkHandler` with two-phase buffer system. Remove `redirectHint` from `prepareMessage` return type. Update `postMessage` to use classifier on full response. |
| `guardrail-evaluation.service.ts` | Remove `redirectHint` handling from `evaluateInput`. Add `classifyOutput()` method wrapping the art-topic classifier for output checking. Simplify `evaluateOutput` to use classifier. |
| `langchain.orchestrator.ts` | Remove `redirectHint` from `OrchestratorInput` and prompt construction. |
| `llm-sections.ts` | Remove redirect hint injection point from prompt template. |

### Files with Test Updates

| File | Change |
|---|---|
| `art-topic-guardrail.test.ts` | Remove all redirect hint tests. Remove off-topic/external action redirect tests. Simplify to: insult blocks, injection blocks, everything else allows. Update output guardrail tests. |
| `art-topic-guardrail-dynamic.test.ts` | Remove dynamic keyword input tests (no longer used on input). Keep classifier tests but update expectations (no redirect, just allow). |
| `chat-message.service.test.ts` (if exists) | Add buffer phase tests: buffer fills, classifier runs, drain rate, [META] in buffer, guardrail mid-stream. |
| `guardrail-evaluation.service.test.ts` (if exists) | Update to match simplified input + classifier-based output. |

### Constants/Config

| Constant | Value | Location |
|---|---|---|
| `BUFFER_TOKEN_THRESHOLD` | 100 | `chat-message.service.ts` |
| `TOKEN_RELEASE_INTERVAL_MS` | 35 | `chat-message.service.ts` |
| `CLASSIFIER_TIMEOUT_MS` | 3000 | `chat-message.service.ts` |
| `BUFFER_LOW_WATERMARK` | 0.2 | `chat-message.service.ts` |
| `BUFFER_HIGH_WATERMARK` | 2.0 | `chat-message.service.ts` |

## What Does NOT Change

- **Frontend**: No changes. `FLUSH_INTERVAL_MS`, SSE parser, streaming hooks, rendering — all unchanged.
- **SSE event format**: Same `token`, `done`, `error`, `guardrail` events.
- **System prompt**: Art-topic instructions remain the primary enforcer.
- **Classifier implementation**: Same `ArtTopicClassifier` class, same model priority (OpenAI > Google > DeepSeek), same 3s timeout.
- **Refusal messages**: Same `guardrail-refusals.ts` i18n strings.
- **Audit logging**: Same `AUDIT_SECURITY_GUARDRAIL_BLOCK` events.
- **Dynamic art keywords**: Kept in DB, refreshed every 5 min, but no longer used in input evaluation. Could be used as supplementary signal in the output classifier prompt in a future iteration.
- **Hard blocks (insult/injection)**: Same keyword lists, same behavior — these never go to the LLM.

## Edge Cases

| Scenario | Behavior |
|---|---|
| LLM produces < 100 tokens total (short response) | Phase 1 ends when LLM stream completes. Classifier runs on whatever was buffered. If approved, drain entire buffer. |
| Classifier times out (3s) | Fail-open: treat as "art", release buffer. Log warning. |
| Classifier network error | Fail-open: treat as "art", release buffer. Log warning. |
| `[META]` appears in first 100 tokens | Very short answer. Drain answer portion, parse metadata from buffer. |
| Client disconnects during phase 1 | AbortController triggers, buffer discarded, no SSE events sent. |
| Insult detected in phase 2 (mid-stream) | Send `guardrail` SSE event immediately. Stop draining. Client replaces text with refusal. |
| Buffer runs empty during phase 2 | Timer pauses (no-op ticks). Resumes when LLM sends more tokens. |
| No classifier configured (no API key) | Fail-open: skip phase 1 classifier check. Buffer still fills for jitter smoothing, then drains normally. |

## Testing Strategy

### Unit Tests

1. **Input guardrail**: insult → block, injection → block, anything else → allow (no redirect)
2. **Buffer phase 1**: accumulates tokens, runs classifier, blocks on "not art", passes on "art"
3. **Buffer phase 1 fail-open**: classifier timeout → release, classifier error → release
4. **Buffer drain**: tokens release at steady interval, adaptive rate on low/high watermark
5. **[META] in buffer**: stripped correctly, metadata parsed, only answer tokens drained
6. **Mid-stream insult**: keyword detected during phase 2, guardrail event sent
7. **Short response**: LLM finishes before 100 tokens, phase 1 ends early, classifier still runs

### Integration Tests

1. **Full pipeline**: message → buffer → classifier → drain → done event
2. **Guardrail block**: message → buffer → classifier says "not art" → guardrail event
3. **Client disconnect**: message → buffer → client closes → graceful cleanup
