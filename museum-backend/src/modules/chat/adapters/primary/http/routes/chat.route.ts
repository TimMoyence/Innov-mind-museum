import { Router } from 'express';

import { createDescribeRouter } from '@modules/chat/adapters/primary/http/routes/chat-describe.route';
import { createMediaRouter } from '@modules/chat/adapters/primary/http/routes/chat-media.route';
import { createMemoryRouter } from '@modules/chat/adapters/primary/http/routes/chat-memory.route';
import { createMessageRouter } from '@modules/chat/adapters/primary/http/routes/chat-message.route';
import { createSessionRouter } from '@modules/chat/adapters/primary/http/routes/chat-session.route';
import { createUploadAdmissionMiddleware } from '@src/helpers/middleware/upload-admission.middleware';

import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { DescribeService } from '@modules/chat/useCase/describe/describe.service';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

/**
 * Builds Express router for chat endpoints by composing session, message, and media sub-routers.
 *
 * @param chatService - Injected chat application service.
 * @param artKeywordRepo - Optional art keyword repository for keyword endpoints.
 * @returns Configured Express Router.
 */
export const createChatRouter = (
  chatService: ChatService,
  artKeywordRepo?: ArtKeywordRepository,
  userMemoryService?: UserMemoryService,
  describeService?: DescribeService,
): Router => {
  const router = Router();

  // Single shared upload-admission middleware instance so the concurrency
  // counter is consistent across all sub-routers (message + media).
  const uploadAdmission = createUploadAdmissionMiddleware();

  router.use('/', createSessionRouter(chatService));
  router.use('/', createMessageRouter(chatService, artKeywordRepo, uploadAdmission));
  router.use('/', createMediaRouter(chatService, uploadAdmission));
  if (userMemoryService) {
    router.use('/', createMemoryRouter(userMemoryService));
  }
  if (describeService) {
    router.use('/', createDescribeRouter(describeService));
  }

  return router;
};
