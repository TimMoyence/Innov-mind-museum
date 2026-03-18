import { parseAssistantResponse } from '@modules/chat/application/assistant-response';

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
});
