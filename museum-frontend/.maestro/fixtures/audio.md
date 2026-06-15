# Maestro audio fixture contract

Maestro cannot drive a real microphone on a simulator/emulator, so
`audio-recording-flow.yaml` relies on a build-time **fixture injection seam** in
the recorder hook. When the seam is enabled the recorder returns a bundled
pre-recorded clip instead of capturing live audio, so the full STT → LLM → TTS
round-trip runs deterministically.

## Contract

The seam lives in
[`features/chat/application/maestroAudioFixture.ts`](../../features/chat/application/maestroAudioFixture.ts)
and is wired into
[`features/chat/application/useAudioRecorder.ts`](../../features/chat/application/useAudioRecorder.ts).

It is gated on the build-time env flag:

```
EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE=true
```

`EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time, so the flag
must be set on the build job (not at `maestro test` runtime). When set:

- `useAudioRecorder.startRecording()` flips `isRecording` to `true` **without**
  driving `expo-audio` / `MediaRecorder` — no OS microphone is touched, so no
  permission dialog appears.
- `useAudioRecorder.stopRecording()` resolves the bundled clip via
  `expo-asset` (`Asset.fromModule(...).downloadAsync()`) to a readable
  `file://` URI and exposes it as `recordedAudioUri`.

That URI then flows through the **same** upload path as a live recording
(`useChatSessionInputHandlers.onSend` → `sendMessageAudio` →
`chatApi/audio.ts` `appendRnFile` → multipart `POST /chat/sessions/:id/audio`),
so the backend STT (`gpt-4o-mini-transcribe`) → LLM → TTS (`gpt-4o-mini-tts`)
pipeline runs unchanged.

When the flag is **absent** (every production build) the seam is inert: the
recorder is on the live `expo-audio` path and behaves exactly as before. There
is zero production behaviour change.

## The fixture asset

`assets/audio-fixtures/maestro-mona-lisa.m4a` — committed, mono AAC M4A
(~1.5 s), spoken content **"Who painted the Mona Lisa"** in English. M4A is the
same container the native recorder emits, so the upload path's MIME handling
(`audio/mp4`) needs no special-casing.

It is `require()`'d as a bundled Metro asset (default Expo `assetExts` already
includes `m4a`), so it ships inside the test build with no CI bootstrap step.

Regeneration (one-off — regen only if the transcript assertion in
`audio-recording-flow.yaml` changes):

```bash
say -v Samantha -o /tmp/mona.aiff "Who painted the Mona Lisa"
afconvert -f m4af -d aac -b 64000 /tmp/mona.aiff \
  museum-frontend/assets/audio-fixtures/maestro-mona-lisa.m4a
```

(`afconvert` ships with macOS; `ffmpeg` works too if available.)

## Why this approach

Direct microphone simulation via Maestro is unsupported and would require either:

1. A custom Maestro driver per-platform (high maintenance), or
2. A mocked audio backend in production code (anti-pattern — production reads
   the real device).

The build-time, env-gated seam keeps the test artifact strictly out of the
production code path (the live recorder branch is untouched) while still
exercising the real backend STT/LLM/TTS pipeline end to end.
