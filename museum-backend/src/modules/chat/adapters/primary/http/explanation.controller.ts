import { parseExplanationParams } from '@modules/chat/adapters/primary/http/chat.contracts';
import { getRequestUser } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import {
  type GetMessageExplanationUseCase,
  MessageNotFoundForExplanationError,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { AppError, notFound } from '@shared/errors/app.error';

import type { Request, RequestHandler, Response } from 'express';

/**
 * GDPR Art. 22 + AI Act Art. 14 / Art. 50. Auth enforced upstream by `isAuthenticated`;
 * defensive re-check of `req.user.id` prevents router regression from surfacing
 * explanations to anonymous traffic. Cross-tenant probes mapped to 404
 * (security-through-obscurity per `docs/GDPR_ART22_SCOPE.md`).
 */
export function createExplanationHandler(useCase: GetMessageExplanationUseCase): RequestHandler {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const { messageId } = parseExplanationParams(req.params);

    // Prefer explicit `?locale=` query (mobile mid-session change) over request-scoped
    // locale from upstream Accept-Language i18n middleware.
    const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    const clientLocale = (req as { clientLocale?: string }).clientLocale;
    const effectiveLocale = queryLocale ?? clientLocale;

    try {
      const explanation = await useCase.execute({
        messageId,
        userId: currentUser.id,
        ...(effectiveLocale !== undefined ? { locale: effectiveLocale } : {}),
      });
      res.status(200).json(explanation);
    } catch (error) {
      if (error instanceof MessageNotFoundForExplanationError) {
        throw notFound('Message not found');
      }
      throw error;
    }
  };
}
