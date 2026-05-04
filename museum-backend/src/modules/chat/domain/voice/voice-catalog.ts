/**
 * Curated list of OpenAI gpt-4o-mini-tts voice ids supported by Musaium.
 * Adding/removing a voice requires updating the FE mirror at
 * museum-frontend/features/settings/voice-catalog.ts and the OpenAPI enum.
 */
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
/**
 * Union of voice ids accepted by the Musaium TTS pipeline.
 */
export type TtsVoice = (typeof TTS_VOICES)[number];

/**
 * Type guard validating that an unknown value is a supported TTS voice id.
 */
export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === 'string' && (TTS_VOICES as readonly string[]).includes(value);
}
