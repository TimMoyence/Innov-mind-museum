# Voice V1 — Latency Measurement Report

**Date**: 2026-04-XX  
**Tester**: ___  
**Gate**: P50 < 3500ms wifi / < 5000ms 4G → keep classical pipeline. Above → open Realtime WebRTC ticket (V1.1).

---

## Measurement Protocol

**Metric**: `t_record_end → t_first_audio_byte`  
(User releases mic → first byte of TTS audio received by device)

**Environments**: iPhone wifi (home) · iPhone 4G/5G · Pixel wifi

**Breakdown to log**:
| Phase | Variable |
|-------|----------|
| Audio upload to backend | `t_audio_upload` |
| STT transcription (gpt-4o-mini-transcribe) | `t_transcription` |
| LLM response (LangChain) | `t_llm` |
| TTS synthesis (gpt-4o-mini-tts) | `t_tts_synth` |
| Audio download first byte | `t_audio_download` |

---

## Results

### iPhone — Wifi (5 trials)

| # | t_total | t_audio_upload | t_transcription | t_llm | t_tts_synth | t_audio_download | Notes |
|---|---------|---------------|-----------------|-------|-------------|-----------------|-------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| **P50** | | | | | | | |

### iPhone — 4G/5G (5 trials)

| # | t_total | t_audio_upload | t_transcription | t_llm | t_tts_synth | t_audio_download | Notes |
|---|---------|---------------|-----------------|-------|-------------|-----------------|-------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| **P50** | | | | | | | |

### Pixel — Wifi (5 trials)

| # | t_total | t_audio_upload | t_transcription | t_llm | t_tts_synth | t_audio_download | Notes |
|---|---------|---------------|-----------------|-------|-------------|-----------------|-------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| **P50** | | | | | | | |

---

## Summary

| Env | P50 (ms) | P90 (ms) | Gate |
|-----|----------|----------|------|
| iPhone wifi | | | PASS / FAIL |
| iPhone 4G | | | PASS / FAIL |
| Pixel wifi | | | PASS / FAIL |

**Bottleneck**: ___  
**Decision**: Classical pipeline sufficient / → open NL-8-v3 Realtime WebRTC ticket

---

## TTS Cache Behavior

- 1st play (synthesis): ___ms
- 2nd play (cache hit — Redis): ___ms  
- 3rd play (local file cache — offline): ___ms *(airplane mode)*
