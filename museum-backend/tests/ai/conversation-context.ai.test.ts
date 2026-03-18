import {
  shouldRunAiTests,
  buildAiTestService,
  assertArtResponse,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

describeAi('AI conversation context (real LLM)', () => {
  jest.setTimeout(60_000);

  it('second message references context from the first', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    await service.postMessage(session.id, {
      text: 'Tell me about the Mona Lisa by Leonardo da Vinci',
      context: { locale: 'en-US' },
    });

    const result = await service.postMessage(session.id, {
      text: 'What technique did he use for it?',
      context: { locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(
      /sfumato|technique|paint|layer|chiaroscuro|oil|leonardo|mona lisa/,
    );
  });

  it('maintains conversation coherence across 3 turns', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    await service.postMessage(session.id, {
      text: 'I am looking at a sculpture of David. Who made it?',
      context: { locale: 'en-US', museumMode: true },
    });

    await service.postMessage(session.id, {
      text: 'When was it completed?',
      context: { locale: 'en-US', museumMode: true },
    });

    const result = await service.postMessage(session.id, {
      text: 'What material is it made of?',
      context: { locale: 'en-US', museumMode: true },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(/marble|stone|david|michelangelo/);
  });

  it('handles museum mode with visit recommendations', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    const result = await service.postMessage(session.id, {
      text: 'I just finished looking at the Mona Lisa. What should I see next at the Louvre?',
      context: { locale: 'en-US', museumMode: true, location: 'Louvre Museum' },
    });

    assertArtResponse(result.message.text);
  });

  it('follows up in French after initial French context', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    await service.postMessage(session.id, {
      text: 'Parlez-moi de la Venus de Milo',
      context: { locale: 'fr-FR' },
    });

    const result = await service.postMessage(session.id, {
      text: 'Ou peut-on la voir ?',
      context: { locale: 'fr-FR' },
    });

    assertArtResponse(result.message.text);
    expect(result.message.text.toLowerCase()).toMatch(/louvre|mus[ée]e|paris|salle/);
  });
});
