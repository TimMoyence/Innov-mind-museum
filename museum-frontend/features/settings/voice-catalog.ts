/**
 * Mirror of the backend TTS voice catalog at
 * museum-backend/src/modules/chat/voice-catalog.ts.
 * The sentinel test in this folder pins the order and asserts parity
 * against the canonical list.
 */
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
