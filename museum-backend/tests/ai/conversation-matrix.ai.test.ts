import {
  shouldRunAiTests,
  buildAiTestService,
  assertSubstantiveAnswer,
  assertGracefulNonEmpty,
  looksFrench,
  looksEnglish,
  looksSpanish,
  looksGerman,
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

  it('LANGUAGE FIDELITY: Spanish question → Spanish answer (CAN-LANG-03)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'es-ES' });

    const result = await service.postMessage(session.id, {
      text: '¿Puedes hablarme del Guernica de Picasso y su significado?',
      context: { locale: 'es-ES' },
    });

    assertSubstantiveAnswer(result);
    expect(looksSpanish(result.message.text)).toBe(true);
  });

  it('LANGUAGE FIDELITY: German question → German answer (CAN-LANG-04)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'de-DE' });

    const result = await service.postMessage(session.id, {
      text: 'Kannst du mir den Expressionismus und seine wichtigsten Künstler erklären?',
      context: { locale: 'de-DE' },
    });

    assertSubstantiveAnswer(result);
    expect(looksGerman(result.message.text)).toBe(true);
  });

  it('META-CAPABILITY (CAN-META-01): "Que sais-tu faire ?" → honest art/culture description', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Que sais-tu faire exactement ?',
      context: { locale: 'fr-FR' },
    });

    assertSubstantiveAnswer(result);
    // Should describe its actual mission (art / culture / museum / monuments),
    // not over-promise unrelated capabilities.
    expect(result.message.text.toLowerCase()).toMatch(
      /art|culture|musée|monument|œuvre|patrimoine|tableau|peinture/,
    );
  });

  it('VOICE MODE (voiceMode:true) → short prose answer, no markdown bullets/headers', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      // Simulates an STT transcript; voiceMode constrains the LLM to a 60-80
      // word prose-only answer (no markdown) — see ChatRequestContext.voiceMode.
      text: 'Tell me quickly about the Mona Lisa.',
      context: { locale: 'en-US', voiceMode: true },
    });

    assertSubstantiveAnswer(result);
    const text = result.message.text;
    // Prose-only contract: no markdown list markers, no headers. Best-effort —
    // a genuine markdown dump here is a real voice-mode regression.
    expect(text).not.toMatch(/^\s*[-*]\s+/m);
    expect(text).not.toMatch(/^#{1,6}\s/m);
  });

  it('MULTI-SUBJECT (EDGE-MIX-02): three topics in one message → graceful, no crash', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: "Parle-moi de Monet, du Colisée et de la technique du sfumato, tout d'un coup.",
      context: { locale: 'fr-FR' },
    });

    // Several valid cultural topics at once: must not crash; should engage
    // substantively (handle or prioritize) rather than refuse.
    assertSubstantiveAnswer(result);
  });

  it('MIXED LANGUAGES (EDGE-MIX-01): code-switched input → graceful non-empty reply', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about la Joconde y su historia, please.',
      context: { locale: 'en-US' },
    });

    assertGracefulNonEmpty(result);
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
