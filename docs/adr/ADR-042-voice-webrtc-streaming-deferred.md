# ADR-042 — Voice WebRTC realtime streaming deferred to V1.1

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1) + `docs/AI_VOICE.md` (V1.1 reference)

## Context

Voice V1 (2026-04) ships with classical pipeline STT → LLM → TTS:
- STT: `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`)
- LLM: LangChain orchestrator multi-provider
- TTS: `gpt-4o-mini-tts` (env `TTS_MODEL`)

Realtime WebRTC streaming (full-duplex voice, OpenAI Realtime API or equivalent) is mentioned in `docs/AI_VOICE.md` as reported V1.1.

## Decision

Defer to V1.1. V1 (2026-06-01) ships only the classical batch pipeline. No bidirectional audio stream, no interruption handling, no client-side WebRTC peer connection.

## Why

- Classical pipeline latency (1.5-3s end-to-end) is acceptable for the target use case (visitor pausing in front of artwork).
- WebRTC adds significant client/server complexity: peer-connection lifecycle, ICE/TURN servers, audio codec negotiation, partial-utterance handling.
- Realtime API providers' pricing models are evolving — locking in now would risk overcommit.

## Consequences

- V1 voice surface stays simple. Guardrails (input + output) apply to the intermediate text, easier to reason about.
- WebRTC reopening will need: latency SLO, infra cost model (TURN bandwidth), interrupt-handling UX spec.

## Reopen trigger

Any of: visitor user-test (>10 sessions) shows latency complaint as top-2 issue, provider pricing stabilizes ≤ 2× current STT+TTS combined cost, B2B buyer explicitly requests realtime feature.
