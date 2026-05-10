import { Router } from 'express';

import { createUploadAdmissionMiddleware } from '@src/helpers/middleware/upload-admission.middleware';

import { createCompareRouter } from './chat-compare.route';
import { createDescribeRouter } from './chat-describe.route';
import { createMediaRouter } from './chat-media.route';
import { createMemoryRouter } from './chat-memory.route';
import { createMessageRouter } from './chat-message.route';
import { createSessionRouter } from './chat-session.route';

import type { CompareRouterDeps } from './chat-compare.route';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { DescribeService } from '@modules/chat/useCase/describe/describe.service';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

/** Phase 5 compare-image use-case — narrowed to the deps shape required by `createCompareRouter`. */
export type CompareImageUseCase = CompareRouterDeps['compareImageUseCase'];

/**
 * Builds Express router for chat endpoints by composing session, message, and media sub-routers.
 *
 * @param chatService - Injected chat application service.
 * @param artKeywordRepo - Optional art keyword repository for keyword endpoints.
 * @param userMemoryService - Optional user memory service (gated on memory feature).
 * @param describeService - Optional standalone describe service.
 * @param compareImageUseCase - Optional Phase 5 compare-image use-case (T6.3 — visual similarity).
 *   Mounts `POST /chat/compare` only when the use-case is wired (composition root T5.5).
 * @returns Configured Express Router.
 */
export const createChatRouter = (
  chatService: ChatService,
  artKeywordRepo?: ArtKeywordRepository,
  userMemoryService?: UserMemoryService,
  describeService?: DescribeService,
  compareImageUseCase?: CompareImageUseCase,
): Router => {
  const router = Router();

  // Single shared upload-admission middleware instance so the concurrency
  // counter is consistent across all sub-routers (message + media + compare).
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
  if (compareImageUseCase) {
    // T6.3 — `POST /chat/compare`. Mounted behind the same upload-admission
    // middleware so the global multipart concurrency counter stays consistent
    // across message + media + compare uploads.
    router.use('/', createCompareRouter({ compareImageUseCase, uploadAdmission }));
  }

  return router;
};
