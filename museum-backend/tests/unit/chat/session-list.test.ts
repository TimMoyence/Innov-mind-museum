import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat session list', () => {
  it('rejects invalid cursor format', async () => {
    const chatService = buildChatTestService();

    await expect(
      chatService.listSessions({ limit: 20, cursor: 'not-a-valid-cursor' }, 11),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
