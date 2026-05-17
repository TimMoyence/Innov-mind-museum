import { Router } from 'express';

import { createExplanationHandler } from '@modules/chat/adapters/primary/http/explanation.controller';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { createUploadAdmissionMiddleware } from '@shared/middleware/upload-admission.middleware';

import { createCompareRouter } from './chat-compare.route';
import { createDescribeRouter } from './chat-describe.route';
import { createMediaRouter } from './chat-media.route';
import { createMemoryRouter } from './chat-memory.route';
import { createMessageRouter } from './chat-message.route';
import { createSessionRouter } from './chat-session.route';

import type { CompareRouterDeps } from './chat-compare.route';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { DescribeService } from '@modules/chat/useCase/describe.service';
import type { GetMessageExplanationUseCase } from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

export type CompareImageUseCase = CompareRouterDeps['compareImageUseCase'];
export type CompareSessionAccessVerifier = CompareRouterDeps['verifySessionAccess'];

/* eslint-disable max-params -- backward-compat: 7 positional args; options-object
   refactor tracked in TECH_DEBT (post-merge).
   Justification: ≥20 chars — keeping positional args avoids cross-PR churn.
   Approved-by: tim@2026-05-12 */
export const createChatRouter = (
  chatService: ChatService,
  artKeywordRepo?: ArtKeywordRepository,
  userMemoryService?: UserMemoryService,
  describeService?: DescribeService,
  compareImageUseCase?: CompareImageUseCase,
  compareSessionAccessVerifier?: CompareSessionAccessVerifier,
  getMessageExplanationUseCase?: GetMessageExplanationUseCase,
): Router => {
  const router = Router();

  // Shared instance so concurrency counter is consistent across message/media/compare.
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
  if (getMessageExplanationUseCase) {
    // GDPR Art. 22 + AI Act Art. 14/50 — see docs/GDPR_ART22_SCOPE.md.
    router.get(
      '/messages/:id/explanation',
      isAuthenticated,
      createExplanationHandler(getMessageExplanationUseCase),
    );
  }

  if (compareImageUseCase && compareSessionAccessVerifier) {
    // SEC 2026-05-10 — BOTH required; without verifier = cross-tenant write surface.
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
