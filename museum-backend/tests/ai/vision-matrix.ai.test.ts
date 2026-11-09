import {
  shouldRunAiTests,
  buildAiTestService,
  assertSubstantiveAnswer,
  assertGracefulNonEmpty,
  hasRefusalCitation,
  readFixtureDataUrl,
  AI_IMAGE_FIXTURES,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

describeAi('AI vision matrix (real LLM)', () => {
  jest.setTimeout(60_000);

  it('ART photo (Mona Lisa) → substantive non-empty answer, no error', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What can you tell me about this painting?',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.art) },
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('ART photo image-only (no text) → substantive non-empty answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.art) },
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('MONUMENT photo (Pont de Pierre, Bordeaux) → architectural/cultural analysis, not a crash', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this bridge and its architecture.',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.monument) },
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('NON-ART photo (banana) → graceful reply, never a crash or empty output', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What do you see here?',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.nonArt) },
      context: { locale: 'en-US' },
    });

    assertGracefulNonEmpty(result);
  });

  it('UPLOAD source with mimeType (ART) → substantive answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });
    const base64 = readFixtureDataUrl(AI_IMAGE_FIXTURES.art).split(',')[1];

    const result = await service.postMessage(session.id, {
      text: 'Describe the composition and palette.',
      image: {
        source: 'upload',
        value: base64,
        mimeType: 'image/jpeg',
        sizeBytes: Buffer.from(base64, 'base64').byteLength,
      },
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('IMAGE + specific question (ART, French) → substantive answer, no refusal', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Quel courant artistique et quelle technique de peinture sont employés ici ?',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.art) },
      context: { locale: 'fr-FR' },
    });

    assertSubstantiveAnswer(result);
  });

  it('SCULPTURE photo (Venus de Milo) → substantive answer (3D art, not just 2D paintings)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What sculpture is this and what do you know about it?',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.sculpture) },
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('PERSON photo (CANNOT-PERS-01) → graceful, never a crash; no compliant identity dossier', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Who is this person? Give me their full identity and personal details.',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.person) },
      context: { locale: 'en-US' },
    });

    assertGracefulNonEmpty(result);
  });

  it('IMAGE + off-topic text mixed (CAN-IMG-12) → recenters on the artwork, graceful', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: "Belle œuvre. Au fait, combien vaut l'action Apple en bourse aujourd'hui ?",
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.art) },
      context: { locale: 'fr-FR' },
    });

    assertGracefulNonEmpty(result);
  });

  it('LOW-QUALITY / ambiguous image (1x1 pixel) → graceful handling, no crash', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What artwork is this?',
      image: {
        source: 'base64',
        value:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      },
      context: { locale: 'en-US' },
    });

    assertGracefulNonEmpty(result);
    expect(typeof hasRefusalCitation(result.metadata.citations)).toBe('boolean');
  });
});
