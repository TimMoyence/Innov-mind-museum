import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat service pagination', () => {
  const USER = 42;

  describe('getSession message pagination', () => {
    it('treats limit 0 as default (falsy → 20)', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });
      await service.postMessage(session.id, { text: 'Tell me about art' }, undefined, USER);

      const result = await service.getSession(session.id, { limit: 0 }, USER);
      expect(result.page.limit).toBe(20);
    });

    it('clamps limit from -1 to 1', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      const result = await service.getSession(session.id, { limit: -1 }, USER);
      expect(result.page.limit).toBe(1);
    });

    it('clamps limit from 100 to 50', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      const result = await service.getSession(session.id, { limit: 100 }, USER);
      expect(result.page.limit).toBe(50);
    });

    it('defaults limit to 20 when not specified', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      const result = await service.getSession(session.id, {}, USER);
      expect(result.page.limit).toBe(20);
    });

    it('returns hasMore when messages exceed limit', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      for (let i = 0; i < 3; i++) {
        await service.postMessage(
          session.id,
          { text: `Tell me about painting ${i}` },
          undefined,
          USER,
        );
      }
      // 3 user + 3 assistant = 6 messages
      const result = await service.getSession(session.id, { limit: 2 }, USER);
      expect(result.page.hasMore).toBe(true);
      expect(result.messages.length).toBe(2);
    });

    it('returns empty messages for a new session', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      const result = await service.getSession(session.id, { limit: 20 }, USER);
      expect(result.messages).toEqual([]);
      expect(result.page.hasMore).toBe(false);
    });
  });

  describe('listSessions pagination', () => {
    it('treats limit 0 as default (falsy → 20)', async () => {
      const service = buildChatTestService();
      const result = await service.listSessions({ limit: 0 }, USER);
      expect(result.page.limit).toBe(20);
    });

    it('clamps limit from -1 to 1', async () => {
      const service = buildChatTestService();
      const result = await service.listSessions({ limit: -1 }, USER);
      expect(result.page.limit).toBe(1);
    });

    it('clamps limit from 100 to 50', async () => {
      const service = buildChatTestService();
      const result = await service.listSessions({ limit: 100 }, USER);
      expect(result.page.limit).toBe(50);
    });

    it('returns hasMore and nextCursor for paginated sessions', async () => {
      const service = buildChatTestService();

      for (let i = 0; i < 3; i++) {
        await service.createSession({ userId: USER, locale: `session-${i}` });
      }

      const page1 = await service.listSessions({ limit: 2 }, USER);
      expect(page1.sessions.length).toBe(2);
      expect(page1.page.hasMore).toBe(true);
      expect(page1.page.nextCursor).not.toBeNull();

      const page2 = await service.listSessions({ limit: 2, cursor: page1.page.nextCursor! }, USER);
      expect(page2.sessions.length).toBe(1);
      expect(page2.page.hasMore).toBe(false);
    });

    it('returns empty for user with no sessions', async () => {
      const service = buildChatTestService();
      const result = await service.listSessions({ limit: 20 }, 9999);

      expect(result.sessions).toEqual([]);
      expect(result.page.hasMore).toBe(false);
      expect(result.page.nextCursor).toBeNull();
    });
  });

  describe('message ordering', () => {
    it('returns messages in chronological order', async () => {
      const service = buildChatTestService();
      const session = await service.createSession({ userId: USER });

      await service.postMessage(session.id, { text: 'Tell me about art first' }, undefined, USER);
      await service.postMessage(
        session.id,
        { text: 'Tell me about sculpture second' },
        undefined,
        USER,
      );

      const result = await service.getSession(session.id, { limit: 50 }, USER);
      const timestamps = result.messages.map((m) => new Date(m.createdAt).getTime());

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });
});
