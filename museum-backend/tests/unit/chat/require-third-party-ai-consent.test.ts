import { requireThirdPartyAiConsent } from '@modules/chat/useCase/require-third-party-ai-consent';
import { AppError, consentRequired } from '@shared/errors/app.error';

import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

const checkerGranting = (granted: boolean) => {
  const asked: { userId: number | undefined | null; scope: string }[] = [];
  const checker: ThirdPartyAiConsentChecker = {
    isGranted: (userId, scope) => {
      asked.push({ userId, scope });
      return Promise.resolve(granted);
    },
  };
  return { checker, asked };
};

describe('requireThirdPartyAiConsent', () => {
  const previousProvider = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  });

  it('resolves when the active provider scope is granted, asking for that scope only', async () => {
    process.env.LLM_PROVIDER = 'google';
    const { checker, asked } = checkerGranting(true);

    await expect(requireThirdPartyAiConsent(checker, 7, 'image')).resolves.toBeUndefined();
    expect(asked).toEqual([{ userId: 7, scope: 'third_party_ai_image_google' }]);
  });

  it('throws 403 CONSENT_REQUIRED naming the refused scope; audio is always the OpenAI scope', async () => {
    process.env.LLM_PROVIDER = 'google';
    const { checker } = checkerGranting(false);

    const refusal = await requireThirdPartyAiConsent(checker, 7, 'audio').catch(
      (err: unknown) => err,
    );

    expect(refusal).toBeInstanceOf(AppError);
    expect(refusal).toMatchObject({
      statusCode: 403,
      code: 'CONSENT_REQUIRED',
      details: { scope: 'third_party_ai_audio_openai' },
    });
  });

  it('asks the checker for an anonymous caller too (null user)', async () => {
    delete process.env.LLM_PROVIDER;
    const { checker, asked } = checkerGranting(false);

    await expect(requireThirdPartyAiConsent(checker, null, 'image')).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { scope: 'third_party_ai_image_openai' },
    });
    expect(asked).toEqual([{ userId: null, scope: 'third_party_ai_image_openai' }]);
  });
});

describe('consentRequired', () => {
  it('builds a 403 CONSENT_REQUIRED error, with no details when no scope is named', () => {
    const err = consentRequired();

    expect(err).toMatchObject({ statusCode: 403, code: 'CONSENT_REQUIRED', details: undefined });
  });
});
