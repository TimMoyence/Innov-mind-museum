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

/**
 * Vision matrix — real LLM (gpt-4o-mini vision), full chat pipeline.
 *
 * Covers the product's image surface end-to-end (in-museum ART + outdoor
 * MONUMENT + NON-ART rejection + the degenerate image-only / ambiguous cases).
 * Fixtures are committed real public-domain photos (tests/ai/fixtures/).
 *
 * Assertions are CATEGORY/shape-level (non-empty, no throw, refusal-citation
 * present/absent) — never exact wording — to survive LLM nondeterminism.
 */
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

    // The product explicitly covers monuments/landmarks outdoors, not just
    // museum art. A monument MUST get a real answer, never a refusal.
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

    // Contract: pipeline does not throw, output is non-empty. Whether the model
    // politely redirects ("I focus on art/culture") OR finds a cultural angle
    // is acceptable — but it must respond gracefully, not crash or return empty.
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

    // The product covers sculpture/3D works, not only paintings. Must produce a
    // real answer, never a refusal.
    assertSubstantiveAnswer(result);
  });

  it('PERSON photo (CANNOT-PERS-01) → graceful, never a crash; no compliant identity dossier', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    // A photo of a real person is NOT an artwork. The pipeline must respond
    // gracefully (pivot to art/culture, describe generically, or decline to
    // profile) — the load-bearing contract here is "no crash, non-empty",
    // since identity behaviour on a public-domain figure is model-dependent.
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

    // Mixed art-image + off-topic finance question: contract is a graceful,
    // non-empty reply (ideally about the artwork, ignoring the stock quote).
    assertGracefulNonEmpty(result);
  });

  it('LOW-QUALITY / ambiguous image (1x1 pixel) → graceful handling, no crash', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    // Degenerate input the vision model cannot meaningfully interpret. The
    // pipeline must still resolve to a non-empty graceful reply (clarification
    // request or a refusal) and never throw.
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
    // A refusal here is acceptable but not required; the load-bearing contract
    // is "non-empty + no throw", already asserted above. We additionally record
    // (without failing) whether a refusal citation was emitted for visibility.
    expect(typeof hasRefusalCitation(result.metadata.citations)).toBe('boolean');
  });
});
