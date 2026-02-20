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

  it('keeps post-message validator compatible with optional diagnostics metadata', () => {
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
          diagnostics: {
            profile: 'parallel_sections',
            degraded: true,
            totalLatencyMs: 1234,
            sections: [
              {
                name: 'summary',
                status: 'success',
                attempts: 1,
                latencyMs: 320,
                timeoutMs: 8000,
                payloadBytes: 1024,
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });
});
