export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
