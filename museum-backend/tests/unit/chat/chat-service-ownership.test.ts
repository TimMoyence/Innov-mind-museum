import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat service ownership checks', () => {
  const USER_A = 101;
  const USER_B = 999;

  it('postMessage rejects when currentUserId does not match session owner', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });

    await expect(
      service.postMessage(session.id, { text: 'Tell me about this painting' }, undefined, USER_B),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('postMessage allows session owner', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });

    const result = await service.postMessage(
      session.id,
      { text: 'Tell me about this painting' },
      undefined,
      USER_A,
    );
    expect(result.message.role).toBe('assistant');
  });

  // SEC-19 (2026-04-08): orphan-adoption fix. An authenticated user MUST NOT
  // be able to read or extend an anonymous/orphaned session — the previous
  // behaviour silently allowed this and let auth users adopt sessions whose
  // owner had been deleted (FK SET NULL). Now rejected uniformly.
  it('postMessage rejects authenticated access to an anonymous session - SEC-19', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({});

    await expect(
      service.postMessage(session.id, { text: 'Tell me about this painting' }, undefined, USER_B),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  // The legitimate end-to-end anonymous flow still works (anonymous caller
  // reaching its own anonymous session — currently used only by the service
  // contract, no route exposes it).
  it('postMessage still allows the anonymous-anonymous flow', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({});

    const result = await service.postMessage(
      session.id,
      { text: 'Tell me about this painting' },
      undefined,
      undefined,
    );
    expect(result.message.role).toBe('assistant');
  });

  it('deleteSessionIfEmpty rejects when currentUserId does not match', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });

    await expect(service.deleteSessionIfEmpty(session.id, USER_B)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('getSession rejects when currentUserId does not match', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });

    await expect(service.getSession(session.id, { limit: 20 }, USER_B)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('getMessageImageRef rejects when currentUserId does not match', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });
    const msg = await service.postMessage(
      session.id,
      { text: 'Tell me about this painting' },
      undefined,
      USER_A,
    );

    await expect(service.getMessageImageRef(msg.message.id, USER_B)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('reportMessage rejects when currentUserId does not match session owner', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({ userId: USER_A });
    const msg = await service.postMessage(
      session.id,
      { text: 'Tell me about this sculpture' },
      undefined,
      USER_A,
    );

    await expect(service.reportMessage(msg.message.id, 'inaccurate', USER_B)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('postMessage throws 404 for non-existent session', async () => {
    const service = buildChatTestService();

    await expect(
      service.postMessage('00000000-0000-0000-0000-000000000000', { text: 'Hello' }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('getSession throws 404 for non-existent session', async () => {
    const service = buildChatTestService();

    await expect(
      service.getSession('00000000-0000-0000-0000-000000000000', { limit: 20 }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('deleteSessionIfEmpty throws 404 for non-existent session', async () => {
    const service = buildChatTestService();

    await expect(
      service.deleteSessionIfEmpty('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('postMessage throws 400 for invalid UUID format', async () => {
    const service = buildChatTestService();

    await expect(service.postMessage('not-a-uuid', { text: 'Hello' })).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('getMessageImageRef throws 404 for non-existent message', async () => {
    const service = buildChatTestService();

    await expect(
      service.getMessageImageRef('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});
