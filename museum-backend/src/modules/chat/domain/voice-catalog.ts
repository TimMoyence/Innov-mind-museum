/**
 * Adding/removing a voice requires updating the FE mirror at
 * museum-frontend/features/settings/voice-catalog.ts and the OpenAPI enum.
 */
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === 'string' && (TTS_VOICES as readonly string[]).includes(value);
}
