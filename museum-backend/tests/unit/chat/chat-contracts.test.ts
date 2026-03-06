import {
  isCreateSessionResponse,
  isDeleteSessionResponse,
  isGetSessionResponse,
  isListSessionsResponse,
  isPostAudioMessageResponse,
  isPostMessageResponse,
  parseCreateSessionRequest,
  parseListSessionsQuery,
  parsePostMessageRequest,
} from '@modules/chat/adapters/primary/http/chat.contracts';

describe('chat.contracts', () => {
  it('parses create-session payload', () => {
    const payload = parseCreateSessionRequest({ locale: 'en-US', museumMode: true });

    expect(payload.locale).toBe('en-US');
    expect(payload.museumMode).toBe(true);
  });

  it('parses post-message payload', () => {
    const payload = parsePostMessageRequest({ text: 'hi', image: 'https://example.com/a.jpg' });

    expect(payload.text).toBe('hi');
    expect(payload.image).toBe('https://example.com/a.jpg');
  });

  it('parses list-sessions query', () => {
    const query = parseListSessionsQuery({ limit: '25', cursor: 'abc' });

    expect(query.limit).toBe(25);
    expect(query.cursor).toBe('abc');
  });

  it('validates response guards', () => {
    expect(
      isCreateSessionResponse({
        session: {
          id: 's1',
          museumMode: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    ).toBe(true);

    expect(
      isPostMessageResponse({
        sessionId: 's1',
        message: {
          id: 'm1',
          role: 'assistant',
          text: 'answer',
          createdAt: new Date().toISOString(),
        },
        metadata: {},
      }),
    ).toBe(true);

    expect(
      isPostAudioMessageResponse({
        sessionId: 's1',
        message: {
          id: 'm1',
          role: 'assistant',
          text: 'answer',
          createdAt: new Date().toISOString(),
        },
        metadata: {},
        transcription: {
          text: 'Transcribed question',
          model: 'gpt-4o-mini-transcribe',
          provider: 'openai',
        },
      }),
    ).toBe(true);

    expect(
      isGetSessionResponse({
        session: {
          id: 's1',
          museumMode: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        messages: [],
        page: {
          nextCursor: null,
          hasMore: false,
          limit: 20,
        },
      }),
    ).toBe(true);

    expect(
      isDeleteSessionResponse({
        sessionId: 's1',
        deleted: true,
      }),
    ).toBe(true);

    expect(
      isListSessionsResponse({
        sessions: [
          {
            id: 's1',
            museumMode: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messageCount: 3,
            preview: {
              text: 'Hello',
              createdAt: new Date().toISOString(),
              role: 'assistant',
            },
          },
        ],
        page: {
          nextCursor: null,
          hasMore: false,
          limit: 20,
        },
      }),
    ).toBe(true);
  });
});
