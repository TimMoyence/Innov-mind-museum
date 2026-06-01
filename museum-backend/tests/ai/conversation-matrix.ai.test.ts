import {
  shouldRunAiTests,
  buildAiTestService,
  assertSubstantiveAnswer,
  assertGracefulNonEmpty,
  looksFrench,
  looksEnglish,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

/**
 * Conversation matrix — real LLM, full pipeline.
 *
 * Multi-turn coherence, response-language fidelity (FR↔EN), edge inputs
 * (very long but valid, over-limit rejection, empty/whitespace rejection,
 * emoji/garbage graceful handling).
 *
 * Empty/whitespace-only with no image is REJECTED by validateMessageInput
 * (`badRequest`, verified in prepare-message.pipeline.ts) — asserted as a
 * throw, which IS the graceful contract (no silent empty answer, no crash).
 */
describeAi('AI conversation matrix (real LLM)', () => {
  jest.setTimeout(90_000);

  it('MULTI-TURN coherence: follow-up "who influenced them?" uses prior context', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    await service.postMessage(session.id, {
      text: 'Tell me about Claude Monet and his role in Impressionism.',
      context: { locale: 'en-US' },
    });

    const result = await service.postMessage(session.id, {
      text: 'And who influenced them?',
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
    // A coherent follow-up resolves "them" → Monet/Impressionists and discusses
    // influences. Tolerant token match (any one signal) for nondeterminism.
    expect(result.message.text.toLowerCase()).toMatch(
      /monet|impressionis|turner|courbet|manet|boudin|delacroix|influence|inspir/,
    );
  });

  it('MULTI-TURN coherence across 3 turns about one artwork', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    await service.postMessage(session.id, {
      text: 'I am looking at The Starry Night. Who painted it?',
      context: { locale: 'en-US' },
    });
    await service.postMessage(session.id, {
      text: 'What emotional state was he in when he made it?',
      context: { locale: 'en-US' },
    });
    const result = await service.postMessage(session.id, {
      text: 'Where can I see it today?',
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
    expect(result.message.text.toLowerCase()).toMatch(/moma|modern art|new york|museum/);
  });

  it('LANGUAGE FIDELITY: French question → French answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Peux-tu me parler du mouvement impressionniste et de ses peintres principaux ?',
      context: { locale: 'fr-FR' },
    });

    assertSubstantiveAnswer(result);
    expect(looksFrench(result.message.text)).toBe(true);
  });

  it('LANGUAGE FIDELITY: English question → English answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Can you explain the Renaissance and its most important painters?',
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
    expect(looksEnglish(result.message.text)).toBe(true);
  });

  it('VERY LONG but valid input (<2000 chars) → substantive answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const filler =
      'I have been thinking a lot about the history of Western painting and how movements built on each other. ';
    // Build a long, on-topic prompt that stays under LLM_MAX_TEXT_LENGTH (2000).
    let longText = '';
    while ((longText + filler).length < 1800) longText += filler;
    longText += 'In one paragraph, how did the Renaissance influence later art?';
    expect(longText.length).toBeLessThan(2000);

    const result = await service.postMessage(session.id, {
      text: longText,
      context: { locale: 'en-US' },
    });

    assertSubstantiveAnswer(result);
  });

  it('OVER-LIMIT input (>2000 chars) → rejected with a 400-class error (no LLM call)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const tooLong = 'art '.repeat(700); // 2800 chars > 2000 limit

    await expect(
      service.postMessage(session.id, { text: tooLong, context: { locale: 'en-US' } }),
    ).rejects.toMatchObject({
      // badRequest() → AppError with statusCode 400. Assert the category, not
      // the exact class, to stay robust to error-mapping refactors.
      statusCode: 400,
    });
  });

  it('EMPTY input (no text, no image) → rejected gracefully, never a silent answer', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    await expect(
      service.postMessage(session.id, { text: '', context: { locale: 'en-US' } }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('WHITESPACE-ONLY input → rejected gracefully (trimmed to empty)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    await expect(
      service.postMessage(session.id, { text: '     \n\t  ', context: { locale: 'en-US' } }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('EMOJI / GARBAGE input → graceful non-empty reply, no crash', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: '🎨🖼️??? ¿¿¿ asdkjh qweqwe ✨🗿',
      context: { locale: 'en-US' },
    });

    // Garbage but non-empty after trim → pipeline must produce a graceful,
    // non-empty reply (likely a clarification or art redirect), never throw.
    assertGracefulNonEmpty(result);
  });
});
