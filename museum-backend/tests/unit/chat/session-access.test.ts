import { ensureSessionAccess, ensureSessionOwnership } from '@modules/chat/useCase/session-access';
import type { ChatRepository } from '@modules/chat/domain/chat.repository.interface';

describe('ensureSessionOwnership', () => {
  describe('authenticated caller', () => {
    it('does not throw when ownerId equals currentUserId', () => {
      expect(() => ensureSessionOwnership(42, 42)).not.toThrow();
    });

    it('throws when IDs differ', () => {
      expect(() => ensureSessionOwnership(42, 99)).toThrow('Chat session not found');
    });

    // SEC-16: ownerId == 0 must still trigger the comparison (the != null guard
    // prevents the legacy `&&` falsy bypass).
    it('throws when ownerId is 0 and currentUserId is 1 - SEC-16', () => {
      expect(() => ensureSessionOwnership(0, 1)).toThrow('Chat session not found');
    });

    // SEC-19 (orphan adoption fix, 2026-04-08): a null ownerId means the session
    // was orphaned by a user deletion (onDelete: SET NULL on the FK). An authenticated
    // user MUST NOT be able to read a deleted user's chat history.
    it('throws when ownerId is null (orphaned session) - SEC-19', () => {
      expect(() => ensureSessionOwnership(null, 1)).toThrow('Chat session not found');
    });

    it('throws when ownerId is undefined (orphaned session) - SEC-19', () => {
      expect(() => ensureSessionOwnership(undefined, 1)).toThrow('Chat session not found');
    });
  });

  describe('anonymous caller', () => {
    // Symmetric guard: an anonymous request must not be able to reach an owned
    // session, even by guessing the UUID. Defensive — every chat route currently
    // mounts isAuthenticated, but this locks the service contract.
    it('throws when ownerId is set but currentUserId is undefined - SEC-19', () => {
      expect(() => ensureSessionOwnership(42, undefined)).toThrow('Chat session not found');
    });

    // Legitimate service-level anonymous flow (no route exposes it today, but
    // the chat-message-service supports it for future demo/guest endpoints).
    it('does not throw when both are nullish (anonymous-anonymous)', () => {
      expect(() => ensureSessionOwnership(null, undefined)).not.toThrow();
      expect(() => ensureSessionOwnership(undefined, undefined)).not.toThrow();
    });
  });
});

describe('ensureSessionAccess', () => {
  it('throws for invalid UUID', async () => {
    const mockRepo = {} as unknown as ChatRepository;
    await expect(ensureSessionAccess('not-a-uuid', mockRepo, 1)).rejects.toThrow(
      'Invalid session id format',
    );
  });

  it('throws for non-existent session', async () => {
    const mockRepo = {
      getSessionById: jest.fn().mockResolvedValue(null),
    } as unknown as ChatRepository;
    await expect(
      ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 1),
    ).rejects.toThrow('Chat session not found');
  });

  it('returns session when ownership matches', async () => {
    const session = { id: 'a0000000-0000-4000-8000-000000000001', user: { id: 1 } };
    const mockRepo = {
      getSessionById: jest.fn().mockResolvedValue(session),
    } as unknown as ChatRepository;
    const result = await ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 1);
    expect(result).toBe(session);
  });

  it('throws when ownership mismatches', async () => {
    const session = { id: 'a0000000-0000-4000-8000-000000000001', user: { id: 42 } };
    const mockRepo = {
      getSessionById: jest.fn().mockResolvedValue(session),
    } as unknown as ChatRepository;
    await expect(
      ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 99),
    ).rejects.toThrow('Chat session not found');
  });
});
