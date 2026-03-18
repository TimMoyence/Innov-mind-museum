import {
  isCreateSessionResponse,
  isGetSessionResponse,
  isListSessionsResponse,
  isPostMessageResponse,
} from '@modules/chat/adapters/primary/http/chat.contracts';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat response contracts', () => {
  it('matches create/post/get response validators', async () => {
    const chatService = buildChatTestService();

    const create = await chatService.createSession({ locale: 'fr-FR' });
    const createPayload = { session: create };
    expect(isCreateSessionResponse(createPayload)).toBe(true);

    const post = await chatService.postMessage(create.id, { text: 'Bonjour' });
    expect(isPostMessageResponse(post)).toBe(true);

    const get = await chatService.getSession(create.id, { limit: 20 });
    expect(isGetSessionResponse(get)).toBe(true);

    const list = await chatService.listSessions({ limit: 20 }, 77);
    expect(isListSessionsResponse(list)).toBe(true);
  });

  it('keeps post-message validator compatible with diagnostics and new metadata fields', () => {
    expect(
      isPostMessageResponse({
        sessionId: 'session-id',
        message: {
          id: 'message-id',
          role: 'assistant',
          text: 'hello',
          createdAt: new Date().toISOString(),
        },
        metadata: {
          deeperContext: 'Historical context here.',
          openQuestion: 'What do you notice about the composition?',
          followUpQuestions: ['Tell me about the artist.', 'What period is this?'],
          imageDescription: 'A painting showing a landscape.',
          diagnostics: {
            profile: 'single_section',
            degraded: false,
            totalLatencyMs: 1234,
            sections: [
              {
                name: 'summary',
                status: 'success',
                attempts: 1,
                latencyMs: 320,
                timeoutMs: 10000,
                payloadBytes: 1024,
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });
});
