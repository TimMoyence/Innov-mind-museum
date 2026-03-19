import { ensureSessionAccess, ensureSessionOwnership } from '@modules/chat/application/session-access';

describe('ensureSessionOwnership', () => {
  it('does not throw when ownerId is null', () => {
    expect(() => ensureSessionOwnership(null, 1)).not.toThrow();
  });

  it('does not throw when currentUserId is undefined', () => {
    expect(() => ensureSessionOwnership(42, undefined)).not.toThrow();
  });

  it('does not throw when both match', () => {
    expect(() => ensureSessionOwnership(42, 42)).not.toThrow();
  });

  it('throws when IDs differ', () => {
    expect(() => ensureSessionOwnership(42, 99)).toThrow('Chat session not found');
  });

  it('does not throw when ownerId is 0 (falsy but not null) - SEC-16', () => {
    // ownerId == 0 is truthy for != null but falsy for &&
    // Our fix uses != null so this should trigger the comparison
    expect(() => ensureSessionOwnership(0, 1)).toThrow('Chat session not found');
  });
});

describe('ensureSessionAccess', () => {
  it('throws for invalid UUID', async () => {
    const mockRepo = {} as any;
    await expect(ensureSessionAccess('not-a-uuid', mockRepo, 1)).rejects.toThrow('Invalid session id format');
  });

  it('throws for non-existent session', async () => {
    const mockRepo = { getSessionById: jest.fn().mockResolvedValue(null) } as any;
    await expect(
      ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 1),
    ).rejects.toThrow('Chat session not found');
  });

  it('returns session when ownership matches', async () => {
    const session = { id: 'a0000000-0000-4000-8000-000000000001', user: { id: 1 } };
    const mockRepo = { getSessionById: jest.fn().mockResolvedValue(session) } as any;
    const result = await ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 1);
    expect(result).toBe(session);
  });

  it('throws when ownership mismatches', async () => {
    const session = { id: 'a0000000-0000-4000-8000-000000000001', user: { id: 42 } };
    const mockRepo = { getSessionById: jest.fn().mockResolvedValue(session) } as any;
    await expect(
      ensureSessionAccess('a0000000-0000-4000-8000-000000000001', mockRepo, 99),
    ).rejects.toThrow('Chat session not found');
  });
});
