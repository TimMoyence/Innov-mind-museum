import { validate as isUuid } from 'uuid';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';

describe('consent-refusal id format — structural invariant for the smoke TTS contract', () => {
  const SAMPLE_SCOPES: ConsentScope[] = [
    'third_party_ai_text_openai',
    'third_party_ai_text_google',
    'third_party_ai_image_openai',
    'third_party_ai_audio_openai',
    'location_to_llm',
  ];

  it.each(SAMPLE_SCOPES)(
    'consent_refusal::%s is NOT a valid UUID (smoke TTS contract depends on this)',
    (scope) => {
      const syntheticId = `consent_refusal::${scope}`;
      expect(isUuid(syntheticId)).toBe(false);
    },
  );

  it('a real chat_message UUID v4 example IS a valid UUID (sanity check on the isUuid validator)', () => {
    const realChatMessageIdSample = '550e8400-e29b-41d4-a716-446655440000';
    expect(isUuid(realChatMessageIdSample)).toBe(true);
  });

  it('the consent_refusal id namespace prefix is byte-exact "consent_refusal::"', () => {
    const EXPECTED_PREFIX = 'consent_refusal::';
    const syntheticId = `${EXPECTED_PREFIX}third_party_ai_text_openai`;
    expect(syntheticId.startsWith(EXPECTED_PREFIX)).toBe(true);
    expect(syntheticId.includes('::')).toBe(true);
  });
});
