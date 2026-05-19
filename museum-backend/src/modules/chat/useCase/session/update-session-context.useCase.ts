import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';

export interface UpdateSessionContextInput {
  sessionId: string;
  /** Caller-supplied; `undefined` skips, `null` clears, `string` sets. */
  currentArtworkId?: string | null;
  currentRoom?: string | null;
  currentUserId?: number;
}

export interface UpdateSessionContextResult {
  sessionId: string;
  currentArtworkId: string | null;
  currentRoom: string | null;
}

/**
 * W3 (T5.3) — Updates the intra-musée context columns (`currentArtworkId`,
 * `currentRoom`) on a chat session row, scoped to the caller's ownership.
 *
 * Flow:
 *   1. {@link ensureSessionAccess} validates the UUID format of `sessionId`
 *      + verifies ownership via {@link ensureSessionOwnership}. Throws 400 on
 *      malformed id, 404 on miss / not-owned.
 *   2. Repo update — only caller-supplied keys land in the SET clause (see
 *      {@link TypeOrmChatRepository.updateSessionContext} doc for the
 *      `undefined`-vs-`null` semantics).
 *   3. Reloads the session to return the new context — caller can confirm
 *      what's persisted (and surface drift to the FE if any).
 *
 * Spec: docs/team-state/2026-05-17-w3-geo-walk-intra/spec.md R19/R20.
 */
export class UpdateSessionContextUseCase {
  constructor(private readonly repository: ChatRepository) {}

  async execute(input: UpdateSessionContextInput): Promise<UpdateSessionContextResult> {
    const { sessionId, currentArtworkId, currentRoom, currentUserId } = input;

    // 1. Access check — throws 400/404 on malformed id / miss / wrong owner.
    await ensureSessionAccess(sessionId, this.repository, currentUserId);

    // 2. Build the explicit patch — `Object.prototype.hasOwnProperty.call`
    // distinguishes "field not supplied" (`undefined`) from "field cleared"
    // (`null`). The repo mirrors the same convention.
    const patch: { currentArtworkId?: string | null; currentRoom?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(input, 'currentArtworkId')) {
      patch.currentArtworkId = currentArtworkId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'currentRoom')) {
      patch.currentRoom = currentRoom ?? null;
    }

    await this.repository.updateSessionContext(sessionId, patch);

    // 3. Reload to surface the post-write state (defence vs cache drift).
    const reloaded = await this.repository.getSessionById(sessionId);
    return {
      sessionId,
      currentArtworkId: reloaded?.currentArtworkId ?? null,
      currentRoom: reloaded?.currentRoom ?? null,
    };
  }
}
