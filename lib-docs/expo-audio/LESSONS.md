# expo-audio — Project Lessons (Musaium, human-edited)

## 2026-05-20

- **`createAudioPlayer` is NOT auto-released** (unlike `useAudioPlayer`). Musaium's `useTextToSpeech.ts` + `useAudioRecorder.ts` use the imperative `createAudioPlayer` because the URI is resolved async per message. Every instance MUST `.remove()` on `didJustFinish`, before replacement, AND on unmount. Both hooks do all three — preserve this when refactoring.
- **`allowsRecording: true` is a session-wide iOS flag that quiets playback.** While recording mode is on, iOS routes/lowers output. `useAudioRecorder.stopRecording()` flips `allowsRecording` back to `false` after `recorder.stop()` so the next TTS plays full-volume. Do not drop that reset.
- **`playsInSilentMode: true` is mandatory for the museum use case** — visitors keep phones on silent; without it TTS is mute on iOS. Set in `useTextToSpeech` audio-mode effect.
- **`recorder.uri` is null until `stop()` resolves** — read it after the await, never before.
- **Web bypasses expo-audio entirely** — Musaium uses `new window.Audio()` + `MediaRecorder`, gated by `Platform.OS === 'web'`. Keep `setAudioModeAsync` native-only.
- **Migration from expo-av is complete** — 0 residual `expo-av` imports (verified 2026-05-20). Do not reintroduce `expo-av`; it is deprecated in SDK 55.
- **TD-35 / TD-34**: `.maestro/audio-recording-flow.yaml` is stale and there is a Maestro path discrepancy. Recording happy-path E2E coverage is not trustworthy until this flow is refreshed (UFR-021 obligation for the voice recording screen).
- **`useTextToSpeech` omits `interruptionMode`** — acceptable for short clips, but means no lock-screen control and default `mixWithOthers` (no focus request). If lock-screen/background control becomes a requirement, add `interruptionMode: 'doNotMix'` + the `enableBackgroundPlayback` config plugin.
