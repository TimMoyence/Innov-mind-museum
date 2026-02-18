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
});
