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

/** Phase 5 compare-image use-case — narrowed to the deps shape required by `createCompareRouter`. */
export type CompareImageUseCase = CompareRouterDeps['compareImageUseCase'];

/** Compare session-ownership verifier — narrowed to the deps shape required by `createCompareRouter`. */
export type CompareSessionAccessVerifier = CompareRouterDeps['verifySessionAccess'];

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
/* eslint-disable max-params -- backward-compat: 7 positional args; bundling
   into an options object would force every call site (4) and every test
   harness (3) to migrate in the same PR. Pre-existing 5-arg signature stayed
   under the 5 cap; T6.3 (compareImageUseCase) lifted to 5; security 2026-05-10
   adds the 6th; GDPR Art. 22 explanation use-case (2026-05-12) adds the 7th.
   The next refactor pass should switch to a `CreateChatRouterDeps` options
   object — tracked in TECH_DEBT (post-merge).
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
  if (getMessageExplanationUseCase) {
    // GDPR Art. 22 + AI Act Art. 14 / Art. 50 — right-to-explanation endpoint.
    // Read-only, requires JWT. Mounted at the chat-router root so the path
    // resolves to `GET /api/chat/messages/:id/explanation` consistently with
    // the other `/messages/:id/...` routes in the media sub-router. See
    // `docs/GDPR_ART22_SCOPE.md`.
    router.get(
      '/messages/:id/explanation',
      isAuthenticated,
      createExplanationHandler(getMessageExplanationUseCase),
    );
  }

  if (compareImageUseCase && compareSessionAccessVerifier) {
    // T6.3 — `POST /chat/compare`. Mounted behind the same upload-admission
    // middleware so the global multipart concurrency counter stays consistent
    // across message + media + compare uploads. Mounted only when BOTH the
    // use-case AND the session-access verifier are wired (security 2026-05-10:
    // mounting without the verifier would create a cross-tenant write surface).
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
