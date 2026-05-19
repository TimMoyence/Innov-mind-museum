import { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeSession, makeSessionUser } from '../../helpers/chat/message.fixtures';

import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

/**
 * W3 (T5.3) — unit tests for `UpdateSessionContextUseCase`.
 *
 * Coverage:
 *   - happy path: patch both fields, both set
 *   - happy path: patch only currentArtworkId, currentRoom untouched
 *   - happy path: clear currentArtworkId via explicit null
 *   - access check delegates to `ensureSessionAccess` — wrong owner → 404
 *   - malformed sessionId → 400 (`ensureSessionAccess` raises)
 *   - reload returns null → useCase returns null fields (degrades gracefully)
 *
 * Spec: docs/team-state/2026-05-17-w3-geo-walk-intra/spec.md R19/R20.
 */

const SESSION_ID = '01234567-89ab-4cde-9012-3456789abcde';
const OWNER_ID = 42;
const ARTWORK_ID = '11111111-2222-4333-9444-555555555555';
const ROOM_ID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';

const makeOwnedSession = (overrides: Partial<ChatSession> = {}): ChatSession =>
  makeSession({
    id: SESSION_ID,
    user: makeSessionUser(OWNER_ID),
    currentArtworkId: null,
    currentRoom: null,
    ...overrides,
  });

describe('UpdateSessionContextUseCase (W3 T5.3)', () => {
  it('patches both currentArtworkId and currentRoom (happy path)', async () => {
    const session = makeOwnedSession();
    const repo = makeChatRepo({
      getSessionById: jest
        .fn()
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(
          makeOwnedSession({ currentArtworkId: ARTWORK_ID, currentRoom: ROOM_ID }),
        ),
    });
    const useCase = new UpdateSessionContextUseCase(repo);

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      currentArtworkId: ARTWORK_ID,
      currentRoom: ROOM_ID,
      currentUserId: OWNER_ID,
    });

    expect(repo.updateSessionContext).toHaveBeenCalledWith(SESSION_ID, {
      currentArtworkId: ARTWORK_ID,
      currentRoom: ROOM_ID,
    });
    expect(result).toEqual({
      sessionId: SESSION_ID,
      currentArtworkId: ARTWORK_ID,
      currentRoom: ROOM_ID,
    });
  });

  it('omits a key when the input does NOT carry it (undefined ≠ null semantics)', async () => {
    const session = makeOwnedSession({ currentArtworkId: ARTWORK_ID, currentRoom: ROOM_ID });
    const repo = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(session),
    });
    const useCase = new UpdateSessionContextUseCase(repo);

    await useCase.execute({
      sessionId: SESSION_ID,
      currentArtworkId: ARTWORK_ID,
      currentUserId: OWNER_ID,
      // No currentRoom — must NOT appear in the patch.
    });

    const patchArg = repo.updateSessionContext.mock.calls[0]?.[1];
    expect(patchArg).toEqual({ currentArtworkId: ARTWORK_ID });
    expect(Object.prototype.hasOwnProperty.call(patchArg, 'currentRoom')).toBe(false);
  });

  it('clears a field when explicitly null', async () => {
    const session = makeOwnedSession({ currentArtworkId: ARTWORK_ID, currentRoom: ROOM_ID });
    const repo = makeChatRepo({
      getSessionById: jest
        .fn()
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce(makeOwnedSession({ currentArtworkId: null, currentRoom: ROOM_ID })),
    });
    const useCase = new UpdateSessionContextUseCase(repo);

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      currentArtworkId: null,
      currentUserId: OWNER_ID,
    });

    expect(repo.updateSessionContext).toHaveBeenCalledWith(SESSION_ID, {
      currentArtworkId: null,
    });
    expect(result.currentArtworkId).toBeNull();
  });

  it('throws 404 on wrong owner via ensureSessionAccess', async () => {
    const session = makeOwnedSession({ user: makeSessionUser(999) });
    const repo = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
    });
    const useCase = new UpdateSessionContextUseCase(repo);

    await expect(
      useCase.execute({
        sessionId: SESSION_ID,
        currentArtworkId: ARTWORK_ID,
        currentUserId: OWNER_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.updateSessionContext).not.toHaveBeenCalled();
  });

  it('throws 400 on malformed sessionId', async () => {
    const repo = makeChatRepo();
    const useCase = new UpdateSessionContextUseCase(repo);

    await expect(
      useCase.execute({
        sessionId: 'not-a-uuid',
        currentArtworkId: ARTWORK_ID,
        currentUserId: OWNER_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns null fields when reload returns null (race with delete)', async () => {
    const session = makeOwnedSession();
    const repo = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(null),
    });
    const useCase = new UpdateSessionContextUseCase(repo);

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      currentArtworkId: ARTWORK_ID,
      currentUserId: OWNER_ID,
    });

    expect(result).toEqual({
      sessionId: SESSION_ID,
      currentArtworkId: null,
      currentRoom: null,
    });
  });
});
