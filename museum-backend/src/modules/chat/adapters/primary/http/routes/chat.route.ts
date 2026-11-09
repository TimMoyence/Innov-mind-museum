import { Router } from 'express';

import { createExplanationHandler } from '@modules/chat/adapters/primary/http/explanation.controller';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { createUploadAdmissionMiddleware } from '@shared/middleware/upload-admission.middleware';

import { createCompareRouter } from './chat-compare.route';
import { createMediaRouter } from './chat-media.route';
import { createMemoryRouter } from './chat-memory.route';
import { createMessageRouter } from './chat-message.route';
import { createSessionRouter } from './chat-session.route';

import type { CompareRouterDeps } from './chat-compare.route';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { GetMessageExplanationUseCase } from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';

export type CompareImageUseCase = CompareRouterDeps['compareImageUseCase'];
export type CompareSessionAccessVerifier = CompareRouterDeps['verifySessionAccess'];

export interface ChatRouterDeps {
  artKeywordRepo?: ArtKeywordRepository;
  userMemoryService?: UserMemoryService;
  compareImageUseCase?: CompareImageUseCase;
  compareSessionAccessVerifier?: CompareSessionAccessVerifier;
  getMessageExplanationUseCase?: GetMessageExplanationUseCase;
  updateSessionContextUseCase?: UpdateSessionContextUseCase;
}

export const createChatRouter = (
  chatService: ChatService,
  {
    artKeywordRepo,
    userMemoryService,
    compareImageUseCase,
    compareSessionAccessVerifier,
    getMessageExplanationUseCase,
    updateSessionContextUseCase,
  }: ChatRouterDeps = {},
): Router => {
  const router = Router();

  const uploadAdmission = createUploadAdmissionMiddleware();

  router.use('/', createSessionRouter(chatService, updateSessionContextUseCase));
  router.use('/', createMessageRouter(chatService, artKeywordRepo, uploadAdmission));
  router.use('/', createMediaRouter(chatService, uploadAdmission));
  if (userMemoryService) {
    router.use('/', createMemoryRouter(userMemoryService));
  }
  if (getMessageExplanationUseCase) {
    router.get(
      '/messages/:id/explanation',
      isAuthenticated,
      createExplanationHandler(getMessageExplanationUseCase),
    );
  }

  if (compareImageUseCase && compareSessionAccessVerifier) {
    router.use(
      '/',
      createCompareRouter({
        compareImageUseCase,
        verifySessionAccess: compareSessionAccessVerifier,
        uploadAdmission,
      }),
    );
  }

  return router;
};
