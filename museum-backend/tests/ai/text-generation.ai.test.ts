import {
  shouldRunAiTests,
  buildAiTestService,
  assertArtResponse,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

describeAi('AI text generation (real LLM)', () => {
  jest.setTimeout(30_000);

  it('answers an art question in English', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: false });

    const result = await service.postMessage(session.id, {
      text: 'Who painted the Mona Lisa and when?',
      context: { locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(/leonardo|da vinci|1503|1506/);
  });

  it('answers an art question in French', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR', museumMode: false });

    const result = await service.postMessage(session.id, {
      text: 'Qui a peint La Joconde et quand ?',
      context: { locale: 'fr-FR' },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(/l[ée]onard|vinci|joconde/);
  });

  it('returns structured response about a specific artwork', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about Starry Night by Van Gogh',
      context: { locale: 'en-US', museumMode: true },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(/starry|van gogh|night/);
  });

  it('adjusts response for beginner guide level', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What is impressionism?',
      context: { guideLevel: 'beginner', locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('adjusts response for expert guide level', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What is impressionism?',
      context: { guideLevel: 'expert', locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('includes museum context when museumMode is enabled', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    const result = await service.postMessage(session.id, {
      text: 'I am standing in front of a large impressionist painting. What should I look for?',
      context: { museumMode: true, locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('handles location context in the prompt', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    const result = await service.postMessage(session.id, {
      text: 'What artworks are nearby?',
      context: { location: 'Louvre Museum, Room 711', locale: 'en-US', museumMode: true },
    });

    assertArtResponse(result.message.text);
  });
});
