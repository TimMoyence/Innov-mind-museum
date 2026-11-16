import { checkThirdPartyAiConsent } from '@modules/chat/useCase/orchestration/consent-gate';

import type { ConsentGateInput } from '@modules/chat/useCase/orchestration/consent-gate';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

const IMAGE = { source: 'url' as const, value: 'https://example.com/a.jpg' };

const messageInput = (overrides: Partial<ConsentGateInput> = {}): ConsentGateInput => ({
  sessionId: 'session-1',
  text: 'Who painted this?',
  image: undefined,
  imageRef: undefined,
  currentUserId: 7,
  requestedLocale: 'en-GB',
  ...overrides,
});

const checkerRefusing = (refused: readonly string[]) => {
  const asked: { userId: number | undefined | null; scope: string }[] = [];
  const checker: ThirdPartyAiConsentChecker = {
    isGranted: (userId, scope) => {
      asked.push({ userId, scope });
      return Promise.resolve(!refused.includes(scope));
    },
  };
  return { checker, asked };
};

describe('CONSENT-GATE · the chat message consent gate', () => {
  const previousProvider = process.env.LLM_PROVIDER;

  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
  });

  afterAll(() => {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  });

  it('CONSENT-GATE · lets the message through when no consent checker is wired', async () => {
    await expect(
      checkThirdPartyAiConsent({ checker: undefined, input: messageInput() }),
    ).resolves.toBeNull();
  });

  it('CONSENT-GATE · asks nothing for a message with neither text nor image', async () => {
    const { checker, asked } = checkerRefusing([]);

    await expect(
      checkThirdPartyAiConsent({ checker, input: messageInput({ text: '' }) }),
    ).resolves.toBeNull();
    expect(asked).toEqual([]);
  });

  it('CONSENT-GATE · asks the text scope, then the image scope, and lets a fully consented message through', async () => {
    const { checker, asked } = checkerRefusing([]);

    await expect(
      checkThirdPartyAiConsent({ checker, input: messageInput({ image: IMAGE }) }),
    ).resolves.toBeNull();
    expect(asked).toEqual([
      { userId: 7, scope: 'third_party_ai_text_openai' },
      { userId: 7, scope: 'third_party_ai_image_openai' },
    ]);
  });

  it('CONSENT-GATE · asks only the image scope for an image without text, on the active provider', async () => {
    process.env.LLM_PROVIDER = 'google';
    const { checker, asked } = checkerRefusing([]);

    await checkThirdPartyAiConsent({
      checker,
      input: messageInput({ text: undefined, image: IMAGE, currentUserId: undefined }),
    });
    expect(asked).toEqual([{ userId: undefined, scope: 'third_party_ai_image_google' }]);
  });

  it('CONSENT-GATE · refuses at the first missing scope with an English assistant reply naming it', async () => {
    const { checker, asked } = checkerRefusing(['third_party_ai_text_openai']);

    const refusal = await checkThirdPartyAiConsent({
      checker,
      input: messageInput({ image: IMAGE }),
    });

    expect(asked).toEqual([{ userId: 7, scope: 'third_party_ai_text_openai' }]);
    expect(refusal).toMatchObject({
      kind: 'refused',
      result: {
        sessionId: 'session-1',
        message: {
          id: 'consent_refusal::third_party_ai_text_openai',
          role: 'assistant',
          text: 'To answer this message I need your consent to share your data with our AI provider. You can enable it in Settings › Privacy.',
        },
        metadata: {
          phase: 'done',
          refusalReason: 'consent_required',
          consentScope: 'third_party_ai_text_openai',
        },
      },
    });
    expect(refusal?.result.message.createdAt).toEqual(expect.any(String));
  });

  it('CONSENT-GATE · refuses the image scope in French when only the image consent is missing', async () => {
    const { checker } = checkerRefusing(['third_party_ai_image_openai']);

    const refusal = await checkThirdPartyAiConsent({
      checker,
      input: messageInput({ image: IMAGE, requestedLocale: 'FR-ca' }),
    });

    expect(refusal?.result.message).toMatchObject({
      id: 'consent_refusal::third_party_ai_image_openai',
      text: "Pour répondre à ce message, j'ai besoin de votre consentement pour partager vos données avec notre fournisseur d'IA. Vous pouvez l'activer dans Paramètres › Confidentialité.",
    });
    expect(refusal?.result.metadata).toMatchObject({ consentScope: 'third_party_ai_image_openai' });
  });

  it('CONSENT-GATE · treats an empty text as no text but a blank text as text', async () => {
    const empty = checkerRefusing(['third_party_ai_text_openai']);
    await expect(
      checkThirdPartyAiConsent({ checker: empty.checker, input: messageInput({ text: '' }) }),
    ).resolves.toBeNull();
    expect(empty.asked).toEqual([]);

    const blank = checkerRefusing(['third_party_ai_text_openai']);
    const refusal = await checkThirdPartyAiConsent({
      checker: blank.checker,
      input: messageInput({ text: '   ' }),
    });
    expect(refusal?.result.metadata).toMatchObject({ consentScope: 'third_party_ai_text_openai' });
  });

  it('CONSENT-GATE · lets a consent lookup failure propagate instead of letting the message through', async () => {
    const checker: ThirdPartyAiConsentChecker = {
      isGranted: () => Promise.reject(new Error('consent store unavailable')),
    };

    await expect(checkThirdPartyAiConsent({ checker, input: messageInput() })).rejects.toThrow(
      'consent store unavailable',
    );
  });

  it('CONSENT-GATE · answers in English when the locale is unknown', async () => {
    const { checker } = checkerRefusing(['third_party_ai_text_openai']);

    const refusal = await checkThirdPartyAiConsent({
      checker,
      input: messageInput({ requestedLocale: undefined }),
    });

    expect(refusal?.result.message.text).toMatch(/^To answer this message/);
  });
});
