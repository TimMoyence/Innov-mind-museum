import {
  parseAssistantResponse,
  extractMetadata,
  META_DELIMITER,
} from '@modules/chat/application/assistant-response';

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

  it('META_DELIMITER constant is correct', () => {
    expect(META_DELIMITER).toBe('\n[META]');
  });
});
