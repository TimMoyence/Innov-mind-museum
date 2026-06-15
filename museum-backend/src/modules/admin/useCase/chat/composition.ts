// Admin chat-moderation composition root (lazy). Mirrors the admin-export lazy
// template (`useCase/export/composition.ts`) so the admin route import chain
// does NOT pull the chat module / AppDataSource / AuditService at module load —
// those are resolved at first request time. The chat repository singleton is
// only available once `buildChatService` has wired the module at boot, hence the
// lazy `getChatRepository()` accessor.
import { GetChatSessionForModerationUseCase } from '@modules/admin/useCase/chat/getChatSessionForModeration.useCase';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { AuditService } from '@shared/audit';

let cachedUseCase: GetChatSessionForModerationUseCase | undefined;

/** Lazy require — defers the chat-module singleton resolution past module load. */
function loadChatRepository(): ChatRepository {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer the chat-module singleton (built at boot) past module load.
  const mod = require('@modules/chat/chat-module') as { getChatRepository: () => ChatRepository };
  return mod.getChatRepository();
}

/** Lazy require — `@shared/audit` barrel eagerly instantiates AuditRepositoryPg w/ AppDataSource. */
function loadAuditService(): AuditService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer auditService instantiation past module load.
  const mod = require('@shared/audit') as { auditService: AuditService };
  return mod.auditService;
}

export function getChatSessionForModerationUseCase(): GetChatSessionForModerationUseCase {
  cachedUseCase ??= new GetChatSessionForModerationUseCase(
    loadChatRepository(),
    loadAuditService(),
  );
  return cachedUseCase;
}
