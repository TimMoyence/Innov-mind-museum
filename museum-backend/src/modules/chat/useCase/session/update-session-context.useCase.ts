import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';

export interface UpdateSessionContextInput {
  sessionId: string;
  currentArtworkId?: string | null;
  currentRoom?: string | null;
  currentUserId?: number;
}

export interface UpdateSessionContextResult {
  sessionId: string;
  currentArtworkId: string | null;
  currentRoom: string | null;
}

export class UpdateSessionContextUseCase {
  constructor(private readonly repository: ChatRepository) {}

  async execute(input: UpdateSessionContextInput): Promise<UpdateSessionContextResult> {
    const { sessionId, currentArtworkId, currentRoom, currentUserId } = input;

    await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const patch: { currentArtworkId?: string | null; currentRoom?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(input, 'currentArtworkId')) {
      patch.currentArtworkId = currentArtworkId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'currentRoom')) {
      patch.currentRoom = currentRoom ?? null;
    }

    await this.repository.updateSessionContext(sessionId, patch);

    const reloaded = await this.repository.getSessionById(sessionId);
    return {
      sessionId,
      currentArtworkId: reloaded?.currentArtworkId ?? null,
      currentRoom: reloaded?.currentRoom ?? null,
    };
  }
}
