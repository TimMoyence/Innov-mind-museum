# Maestro audio fixture contract

Maestro cannot drive a real microphone input device, so `audio-recording-flow.yaml`
relies on the test harness to inject a pre-recorded PCM audio asset during the
`longPressOn { label: "Hold to talk" }` window.

## Contract

When the env var `MAESTRO_AUDIO_FIXTURE=<absolute-path-to-pcm-file>` is set in the
build (debug variant + Maestro Cloud / local Maestro run), the recorder hook in
`museum-frontend/features/chat/recording/` reads the PCM buffer from that file
instead of the live `expo-av` mic stream.

## Expected fixture

- Format: 16-bit PCM mono, 16kHz (matches what `gpt-4o-mini-transcribe` expects).
- Duration: ~2.5 seconds (the longPressOn window is 3000ms; recorder needs a
  ~500ms tail to flush).
- Spoken content: "Who painted the Mona Lisa" in English.

Generation (one-off, regen if the assertion in audio-recording-flow.yaml changes):

```bash
say -v Samantha -o /tmp/audio-fixture.aiff "Who painted the Mona Lisa"
ffmpeg -i /tmp/audio-fixture.aiff -ar 16000 -ac 1 -c:a pcm_s16le /tmp/audio-fixture.pcm
mv /tmp/audio-fixture.pcm museum-frontend/.maestro/fixtures/audio-mona-lisa.pcm
```

The fixture file is NOT committed (binary, can be regenerated). CI bootstraps it
in `.github/workflows/ci-cd-mobile.yml` before running the chat shard.

## Why this approach

Direct microphone simulation via Maestro is unsupported and would require either:
1. A custom Maestro driver per-platform (high maintenance), or
2. A mocked audio backend in production code (anti-pattern — production reads
   the real device).

The harness-side fixture injection isolates the test artifact from prod code and
matches the precedent set for `museum-backend/scripts/fetch-models.sh` (binary
assets pulled at build time, never committed).
