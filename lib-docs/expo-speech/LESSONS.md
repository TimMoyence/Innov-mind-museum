# expo-speech — Project Lessons (Musaium, human-edited)

## 2026-05-20

- **`Speech.speak()` is fire-and-forget and QUEUES** — rapid calls stack and play sequentially, they do not replace. Use `Speech.stop()` (interrupts + flushes queue) to reset before a new utterance.
- **MUST `Speech.stop()` on unmount.** `VoiceSessionIntroSheetContent.tsx` does this correctly (`return () => speech.stop()`). **`useChatSession.ts:120` auto-read of `imageDescription` does NOT** — if the chat screen unmounts mid-utterance the speech keeps playing and the queue persists. Flagged for fix; new `speak()` sites MUST stop on unmount and before re-trigger.
- **Lazy-require pattern** — both call sites load via `require('expo-speech')` inside try/catch and null-check, so test/web bundles without the native module don't crash. Keep this; never top-level `import * as Speech`.
- **on-device vs server TTS split**: `expo-speech` = instant/offline/free but robotic OS voice → only for low-stakes (intro greeting, image-description auto-read). Primary assistant replies go through server TTS (`chatApi.synthesizeSpeech` → `expo-audio`) for brand-consistent OpenAI voices. Do not route primary replies through `expo-speech`.
- **`pause`/`resume` are iOS/Web only** — Android has no pause; degrade to stop+restart.
- **No locale-voice availability check** — `Speech.speak({ language: locale })` silently falls back or stays mute if the device lacks the locale voice; no error thrown. For critical UX prefer server TTS or pre-check `getAvailableVoicesAsync()`.
