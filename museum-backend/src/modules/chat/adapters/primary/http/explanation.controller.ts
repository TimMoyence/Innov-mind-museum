import { parseExplanationParams } from '@modules/chat/adapters/primary/http/chat.contracts';
import {
  type GetMessageExplanationUseCase,
  MessageNotFoundForExplanationError,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { notFound } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';

import type { Request, RequestHandler, Response } from 'express';

export function createExplanationHandler(useCase: GetMessageExplanationUseCase): RequestHandler {
  return async (req: Request, res: Response) => {
    const user = requireUser(req);

    const { messageId } = parseExplanationParams(req.params);

    const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    const clientLocale = (req as { clientLocale?: string }).clientLocale;
    const effectiveLocale = queryLocale ?? clientLocale;

    try {
      const explanation = await useCase.execute({
        messageId,
        userId: user.id,
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
