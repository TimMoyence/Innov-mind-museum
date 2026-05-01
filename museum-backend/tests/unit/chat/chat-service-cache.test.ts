import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import { InMemoryCacheService } from 'tests/helpers/cache/inMemoryCacheService';

describe('chat service – cache integration', () => {
  const USER_ID = 42;

  it('getSession returns cached result on second call', async () => {
    const cache = new InMemoryCacheService();
    const service = buildChatTestService({ cache });

    const session = await service.createSession({ userId: USER_ID });
    await service.postMessage(session.id, { text: 'Hello' }, undefined, USER_ID);

    const first = await service.getSession(session.id, { limit: 20 }, USER_ID);
    const second = await service.getSession(session.id, { limit: 20 }, USER_ID);

    expect(first).toEqual(second);
    expect(cache.has(`session:${session.id}:first:20`)).toBe(true);
  });

  it('listSessions returns cached result on second call', async () => {
    const cache = new InMemoryCacheService();
    const service = buildChatTestService({ cache });

    await service.createSession({ userId: USER_ID });

    const first = await service.listSessions({ limit: 20 }, USER_ID);
    const second = await service.listSessions({ limit: 20 }, USER_ID);

    expect(first).toEqual(second);
    expect(cache.has(`sessions:user:${USER_ID}:first:20`)).toBe(true);
  });

  it('postMessage invalidates session cache', async () => {
    const cache = new InMemoryCacheService();
    const service = buildChatTestService({ cache });

    const session = await service.createSession({ userId: USER_ID });

    // Populate cache
    await service.getSession(session.id, { limit: 20 }, USER_ID);
    expect(cache.has(`session:${session.id}:first:20`)).toBe(true);

    // Post message should invalidate
    await service.postMessage(session.id, { text: 'New message' }, undefined, USER_ID);
    expect(cache.has(`session:${session.id}:first:20`)).toBe(false);
  });

  it('createSession invalidates list cache', async () => {
    const cache = new InMemoryCacheService();
    const service = buildChatTestService({ cache });

    await service.createSession({ userId: USER_ID });

    // Populate list cache
    await service.listSessions({ limit: 20 }, USER_ID);
    expect(cache.has(`sessions:user:${USER_ID}:first:20`)).toBe(true);

    // Creating another session should invalidate list cache
    await service.createSession({ userId: USER_ID });
    expect(cache.has(`sessions:user:${USER_ID}:first:20`)).toBe(false);
  });
});
