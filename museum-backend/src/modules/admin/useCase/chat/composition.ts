import { GetChatSessionForModerationUseCase } from '@modules/admin/useCase/chat/getChatSessionForModeration.useCase';
import { getChatRepository } from '@modules/chat/chat-module';
import { auditService } from '@shared/audit';

let cachedUseCase: GetChatSessionForModerationUseCase | undefined;

export function getChatSessionForModerationUseCase(): GetChatSessionForModerationUseCase {
  cachedUseCase ??= new GetChatSessionForModerationUseCase(getChatRepository(), auditService);
  return cachedUseCase;
}
