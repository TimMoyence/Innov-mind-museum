import { parseAssistantResponse, extractMetadata } from '@modules/chat/useCase/assistant-response';

describe('parseAssistantResponse', () => {
  it('extracts answer and metadata from valid JSON', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Hello',
        detectedArtwork: {
          title: 'Starry Night',
          artist: 'Van Gogh',
          confidence: 0.9,
          source: 'vision-model',
        },
        citations: ['museum-catalog'],
      }),
    );

    expect(parsed.answer).toBe('Hello');
    expect(parsed.metadata.detectedArtwork?.title).toBe('Starry Night');
    expect(parsed.metadata.citations).toEqual(['museum-catalog']);
  });

  it('falls back to raw text when response is not JSON', () => {
    const parsed = parseAssistantResponse('plain text response');

    expect(parsed.answer).toBe('plain text response');
    expect(parsed.metadata).toEqual({});
  });

  it('extracts deeperContext from valid JSON', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Main answer',
        deeperContext: 'This painting was created during a pivotal period.',
      }),
    );

    expect(parsed.metadata.deeperContext).toBe(
      'This painting was created during a pivotal period.',
    );
  });

  it('extracts openQuestion from valid JSON', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Main answer',
        openQuestion: 'What do you notice about the light?',
      }),
    );

    expect(parsed.metadata.openQuestion).toBe('What do you notice about the light?');
  });

  it('extracts followUpQuestions from valid JSON', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Main answer',
        followUpQuestions: ['Tell me about the artist.', 'What period is this from?'],
      }),
    );

    expect(parsed.metadata.followUpQuestions).toEqual([
      'Tell me about the artist.',
      'What period is this from?',
    ]);
  });

  it('ignores followUpQuestions when not an array', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Main answer',
        followUpQuestions: 'not an array',
      }),
    );

    expect(parsed.metadata.followUpQuestions).toBeUndefined();
  });

  it('extracts imageDescription from valid JSON', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'This is a landscape painting.',
        imageDescription: 'Oil on canvas, depicting rolling hills under a cloudy sky.',
      }),
    );

    expect(parsed.metadata.imageDescription).toBe(
      'Oil on canvas, depicting rolling hills under a cloudy sky.',
    );
  });

  it('returns undefined for absent optional fields', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Simple answer',
      }),
    );

    expect(parsed.answer).toBe('Simple answer');
    expect(parsed.metadata.deeperContext).toBeUndefined();
    expect(parsed.metadata.openQuestion).toBeUndefined();
    expect(parsed.metadata.followUpQuestions).toBeUndefined();
    expect(parsed.metadata.imageDescription).toBeUndefined();
  });

  it('handles all new fields together', () => {
    const parsed = parseAssistantResponse(
      JSON.stringify({
        answer: 'Full response',
        deeperContext: 'Deep context.',
        openQuestion: 'Look closer?',
        followUpQuestions: ['Q1'],
        imageDescription: 'A sculpture.',
        recommendations: ['Visit room 3'],
        expertiseSignal: 'intermediate',
      }),
    );

    expect(parsed.answer).toBe('Full response');
    expect(parsed.metadata.deeperContext).toBe('Deep context.');
    expect(parsed.metadata.openQuestion).toBe('Look closer?');
    expect(parsed.metadata.followUpQuestions).toEqual(['Q1']);
    expect(parsed.metadata.imageDescription).toBe('A sculpture.');
    expect(parsed.metadata.recommendations).toEqual(['Visit room 3']);
    expect(parsed.metadata.expertiseSignal).toBe('intermediate');
  });

  // --- [META] delimiter format (streaming-era) ---

  it('parses [META] delimiter format with answer and metadata', () => {
    const raw = `This is the answer text about Monet.\n[META]\n${JSON.stringify({
      deeperContext: 'A deeper look.',
      citations: ['ref-1'],
      expertiseSignal: 'beginner',
    })}`;

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('This is the answer text about Monet.');
    expect(parsed.metadata.deeperContext).toBe('A deeper look.');
    expect(parsed.metadata.citations).toEqual(['ref-1']);
    expect(parsed.metadata.expertiseSignal).toBe('beginner');
  });

  it('parses [META] format with detectedArtwork', () => {
    const raw = `The Starry Night is a masterpiece.\n[META]\n${JSON.stringify({
      detectedArtwork: {
        title: 'The Starry Night',
        artist: 'Van Gogh',
        confidence: 0.95,
        source: 'vision',
      },
      recommendations: ['Visit room 3'],
    })}`;

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('The Starry Night is a masterpiece.');
    expect(parsed.metadata.detectedArtwork?.title).toBe('The Starry Night');
    expect(parsed.metadata.detectedArtwork?.artist).toBe('Van Gogh');
    expect(parsed.metadata.recommendations).toEqual(['Visit room 3']);
  });

  it('handles [META] format with malformed JSON metadata', () => {
    const raw = 'Good answer text\n[META]\n{broken json';

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('Good answer text');
    expect(parsed.metadata).toEqual({});
  });

  it('handles [META] format with empty metadata', () => {
    const raw = 'Answer only\n[META]\n{}';

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('Answer only');
    expect(parsed.metadata).toEqual({});
  });

  it('prefers [META] format over legacy JSON when delimiter present', () => {
    // Even if the answer text looks like JSON, [META] delimiter takes priority
    const raw = '{"answer":"not this"}\n[META]\n{"citations":["real"]}';

    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('{"answer":"not this"}');
    expect(parsed.metadata.citations).toEqual(['real']);
  });

  it('extractMetadata extracts all fields correctly', () => {
    const meta = extractMetadata({
      deeperContext: 'Deep.',
      openQuestion: 'See this?',
      followUpQuestions: ['Q1', 'Q2'],
      imageDescription: 'Oil on canvas.',
      recommendations: ['Room 5'],
      expertiseSignal: 'expert',
      citations: ['ref-1'],
      detectedArtwork: {
        title: 'Mona Lisa',
        artist: 'da Vinci',
        confidence: 0.99,
        source: 'vision',
        museum: 'Louvre',
        room: 'Room 6',
      },
    });

    expect(meta.deeperContext).toBe('Deep.');
    expect(meta.openQuestion).toBe('See this?');
    expect(meta.followUpQuestions).toEqual(['Q1', 'Q2']);
    expect(meta.imageDescription).toBe('Oil on canvas.');
    expect(meta.recommendations).toEqual(['Room 5']);
    expect(meta.expertiseSignal).toBe('expert');
    expect(meta.citations).toEqual(['ref-1']);
    expect(meta.detectedArtwork?.title).toBe('Mona Lisa');
    expect(meta.detectedArtwork?.museum).toBe('Louvre');
  });

  // --- Uncovered branch: [META] with non-object parsed JSON ---

  it('returns empty metadata when [META] JSON parses to a non-object (array)', () => {
    const raw = 'Some answer\n[META]\n[1, 2, 3]';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('Some answer');
    expect(parsed.metadata).toEqual({});
  });

  it('returns empty metadata when [META] JSON parses to a primitive', () => {
    const raw = 'Answer text\n[META]\n"just a string"';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe('Answer text');
    expect(parsed.metadata).toEqual({});
  });

  // --- Uncovered branch: legacy JSON is valid but not an object ---

  it('falls back to raw text when legacy JSON parses to an array', () => {
    const raw = '[1, 2, 3]';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe(raw);
    expect(parsed.metadata).toEqual({});
  });

  // --- Uncovered branch: legacy JSON is object but no answer field ---

  it('falls back to raw text when legacy JSON has no answer field', () => {
    const raw = JSON.stringify({ noAnswer: true, title: 'test' });
    const parsed = parseAssistantResponse(raw);

    expect(parsed.answer).toBe(raw);
    expect(parsed.metadata).toEqual({});
  });

  // --- Uncovered branches in extractMetadata helper functions ---

  it('returns undefined citations when value is not an array', () => {
    const meta = extractMetadata({ citations: 'not-an-array' });
    expect(meta.citations).toBeUndefined();
  });

  it('returns undefined citations when array contains only non-strings', () => {
    const meta = extractMetadata({ citations: [123, true, null] });
    expect(meta.citations).toBeUndefined();
  });

  it('filters non-string items from citations array', () => {
    const meta = extractMetadata({ citations: ['valid', 42, 'also-valid'] });
    expect(meta.citations).toEqual(['valid', 'also-valid']);
  });

  it('returns undefined recommendations when not an array', () => {
    const meta = extractMetadata({ recommendations: 'single-string' });
    expect(meta.recommendations).toBeUndefined();
  });

  it('returns undefined recommendations when all items are empty or non-string', () => {
    const meta = extractMetadata({ recommendations: ['', '  ', 42] });
    expect(meta.recommendations).toBeUndefined();
  });

  it('caps recommendations at 5 items', () => {
    const meta = extractMetadata({
      recommendations: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'],
    });
    expect(meta.recommendations).toHaveLength(5);
  });

  it('returns undefined followUpQuestions when all items are empty strings', () => {
    const meta = extractMetadata({ followUpQuestions: ['', '   '] });
    expect(meta.followUpQuestions).toBeUndefined();
  });

  it('caps followUpQuestions at 3 items', () => {
    const meta = extractMetadata({
      followUpQuestions: ['q1', 'q2', 'q3', 'q4'],
    });
    expect(meta.followUpQuestions).toHaveLength(3);
  });

  it('returns undefined for empty-string deeperContext', () => {
    const meta = extractMetadata({ deeperContext: '   ' });
    expect(meta.deeperContext).toBeUndefined();
  });

  it('returns undefined for non-string deeperContext', () => {
    const meta = extractMetadata({ deeperContext: 42 });
    expect(meta.deeperContext).toBeUndefined();
  });

  it('returns undefined for empty-string openQuestion', () => {
    const meta = extractMetadata({ openQuestion: '' });
    expect(meta.openQuestion).toBeUndefined();
  });

  it('trims toOptionalString values', () => {
    const meta = extractMetadata({ deeperContext: '  trimmed  ' });
    expect(meta.deeperContext).toBe('trimmed');
  });

  it('returns undefined expertiseSignal for invalid level', () => {
    const meta = extractMetadata({ expertiseSignal: 'master' });
    expect(meta.expertiseSignal).toBeUndefined();
  });

  it('returns undefined expertiseSignal for non-string value', () => {
    const meta = extractMetadata({ expertiseSignal: 42 });
    expect(meta.expertiseSignal).toBeUndefined();
  });

  it('returns undefined suggestedImages when not an array', () => {
    const meta = extractMetadata({ suggestedImages: 'not-array' });
    expect(meta.suggestedImages).toBeUndefined();
  });

  it('filters invalid items from suggestedImages', () => {
    const meta = extractMetadata({
      suggestedImages: [
        { query: 'valid', description: 'desc' },
        { query: 'missing-desc' },
        'not-an-object',
        null,
        { query: 123, description: 'wrong type' },
      ],
    });
    expect(meta.suggestedImages).toEqual([{ query: 'valid', description: 'desc' }]);
  });

  it('returns undefined suggestedImages when all items are invalid', () => {
    const meta = extractMetadata({
      suggestedImages: [null, 'string', { noQuery: true }],
    });
    expect(meta.suggestedImages).toBeUndefined();
  });

  it('caps suggestedImages at 3 items', () => {
    const meta = extractMetadata({
      suggestedImages: [
        { query: 'q1', description: 'd1' },
        { query: 'q2', description: 'd2' },
        { query: 'q3', description: 'd3' },
        { query: 'q4', description: 'd4' },
      ],
    });
    expect(meta.suggestedImages).toHaveLength(3);
  });

  // --- detectedArtwork validation (valid + invalid) ---

  it('skips detectedArtwork when it is not an object', () => {
    const meta = extractMetadata({ detectedArtwork: 'not-object' });
    expect(meta.detectedArtwork).toBeUndefined();

    const metaNull = extractMetadata({ detectedArtwork: null });
    expect(metaNull.detectedArtwork).toBeUndefined();
  });

  it('handles detectedArtwork with mixed valid and invalid field types', () => {
    const meta = extractMetadata({
      detectedArtwork: {
        artworkId: 123, // non-string → dropped
        title: 'Test',
        confidence: 'high', // non-number → dropped
        source: 42, // non-string → dropped
        artist: ['arr'], // non-string → dropped
        museum: true, // non-string → dropped
        room: 5, // non-string → dropped
      },
    });
    expect(meta.detectedArtwork?.title).toBe('Test');
    expect(meta.detectedArtwork?.artworkId).toBeUndefined();
    expect(meta.detectedArtwork?.confidence).toBeUndefined();
    expect(meta.detectedArtwork?.source).toBeUndefined();
    expect(meta.detectedArtwork?.artist).toBeUndefined();
    expect(meta.detectedArtwork?.museum).toBeUndefined();
    expect(meta.detectedArtwork?.room).toBeUndefined();
  });
});
