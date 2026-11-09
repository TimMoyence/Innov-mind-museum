export const THIRD_PARTY_AI_SCOPES = [
  'third_party_ai_text_openai',
  'third_party_ai_image_openai',
  'third_party_ai_audio_openai',
  'third_party_ai_profile_openai',
  'third_party_ai_text_google',
  'third_party_ai_image_google',
  'third_party_ai_audio_google',
  'third_party_ai_profile_google',
  'location_to_llm',
  'location_coarse_to_llm',
] as const;

export type ThirdPartyAiScope = (typeof THIRD_PARTY_AI_SCOPES)[number];

export const REQUIRED_CONSENT_SCOPE: ThirdPartyAiScope = 'third_party_ai_text_openai';

export const CONSENT_POLICY_VERSION = '2026-06-01';
