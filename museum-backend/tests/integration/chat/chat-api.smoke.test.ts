import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat api smoke (service integration)', () => {
  it('creates a session, posts a message, and retrieves the session', async () => {
    const chatService = buildChatTestService();

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
    });

    expect(session.id).toBeDefined();

    const response = await chatService.postMessage(session.id, {
      text: 'Tell me about this artwork',
      context: { museumMode: true },
    });

    expect(response.message.role).toBe('assistant');
    expect(response.message.text.length).toBeGreaterThan(0);

    const fetched = await chatService.getSession(session.id, { limit: 20 });
    expect(fetched.messages.length).toBeGreaterThanOrEqual(2);
    expect(fetched.messages[0].role).toBe('user');
    expect(fetched.messages[1].role).toBe('assistant');
  });

  it('lists only sessions of the authenticated user', async () => {
    const chatService = buildChatTestService();

    const userSession = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
      userId: 101,
    });
    await chatService.createSession({
      locale: 'fr-FR',
      museumMode: false,
      userId: 202,
    });

    await chatService.postMessage(userSession.id, {
      text: 'My museum note',
    });

    const list = await chatService.listSessions({ limit: 20 }, 101);

    expect(list.sessions.length).toBe(1);
    expect(list.sessions[0].id).toBe(userSession.id);
    expect(list.sessions[0].messageCount).toBeGreaterThan(0);
  });

  it('returns 200-style empty session list for users without sessions', async () => {
    const chatService = buildChatTestService();
    const list = await chatService.listSessions({ limit: 20 }, 999);

    expect(list.sessions).toEqual([]);
    expect(list.page.hasMore).toBe(false);
    expect(list.page.nextCursor).toBeNull();
  });
});
