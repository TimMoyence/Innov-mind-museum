import { missingThirdPartyAiScope } from '@modules/chat/useCase/require-third-party-ai-consent';

import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

const checkerRefusing = (refused: readonly string[]) => {
  const asked: string[] = [];
  const checker: ThirdPartyAiConsentChecker = {
    isGranted: (_userId, scope) => {
      asked.push(scope);
      return Promise.resolve(!refused.includes(scope));
    },
  };
  return { checker, asked };
};

describe('missingThirdPartyAiScope', () => {
  const previousProvider = process.env.LLM_PROVIDER;

  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
  });

  afterAll(() => {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  });

  it('returns null without asking anything when there is no channel', async () => {
    const { checker, asked } = checkerRefusing(['third_party_ai_text_openai']);

    await expect(missingThirdPartyAiScope(checker, 1, [])).resolves.toBeNull();
    expect(asked).toEqual([]);
  });

  it('returns null when every channel scope is granted, asking each once in order', async () => {
    const { checker, asked } = checkerRefusing([]);

    await expect(
      missingThirdPartyAiScope(checker, 1, ['text', 'image', 'audio']),
    ).resolves.toBeNull();
    expect(asked).toEqual([
      'third_party_ai_text_openai',
      'third_party_ai_image_openai',
      'third_party_ai_audio_openai',
    ]);
  });

  it('returns the first refused scope and stops asking', async () => {
    const { checker, asked } = checkerRefusing([
      'third_party_ai_image_google',
      'third_party_ai_audio_openai',
    ]);
    process.env.LLM_PROVIDER = 'google';

    await expect(missingThirdPartyAiScope(checker, null, ['text', 'image', 'audio'])).resolves.toBe(
      'third_party_ai_image_google',
    );
    expect(asked).toEqual(['third_party_ai_text_google', 'third_party_ai_image_google']);
  });
});
