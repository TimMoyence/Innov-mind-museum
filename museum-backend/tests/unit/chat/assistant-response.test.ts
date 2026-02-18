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
});
