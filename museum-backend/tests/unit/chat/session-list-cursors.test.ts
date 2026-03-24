import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('session list — cursor edge cases', () => {
  it('rejects invalid base64 cursor', async () => {
    const chatService = buildChatTestService();
    await chatService.createSession({ locale: 'en', userId: 1 });

    await expect(
      chatService.listSessions({ limit: 20, cursor: '!invalid!' }, 1),
    ).rejects.toThrow('Invalid cursor format');
  });

  it('rejects cursor with invalid JSON payload', async () => {
    const chatService = buildChatTestService();
    await chatService.createSession({ locale: 'en', userId: 2 });

    const invalidJsonCursor = Buffer.from('not-json').toString('base64url');
    await expect(
      chatService.listSessions({ limit: 20, cursor: invalidJsonCursor }, 2),
    ).rejects.toThrow('Invalid cursor format');
  });

  it('rejects cursor with missing fields', async () => {
    const chatService = buildChatTestService();
    await chatService.createSession({ locale: 'en', userId: 3 });

    const missingFieldsCursor = Buffer.from(JSON.stringify({ updatedAt: 'now' })).toString('base64url');
    await expect(
      chatService.listSessions({ limit: 20, cursor: missingFieldsCursor }, 3),
    ).rejects.toThrow('Invalid cursor format');
  });

  it('returns hasMore=true and nextCursor when sessions exceed limit', async () => {
    const chatService = buildChatTestService();
    for (let i = 0; i < 3; i++) {
      await chatService.createSession({ locale: 'en', userId: 4 });
    }

    const list = await chatService.listSessions({ limit: 2 }, 4);
    expect(list.sessions.length).toBe(2);
    expect(list.page.hasMore).toBe(true);
    expect(list.page.nextCursor).toBeDefined();
    expect(list.page.nextCursor).not.toBeNull();

    // Use the cursor to fetch the next page
    const nextPage = await chatService.listSessions({ limit: 2, cursor: list.page.nextCursor! }, 4);
    expect(nextPage.sessions.length).toBe(1);
    expect(nextPage.page.hasMore).toBe(false);
  });
});
