import { parseAcceptLanguageHeader } from '@shared/i18n/locale';

import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    clientLocale?: string;
  }
}

export const acceptLanguageMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers['accept-language'] as string | string[] | undefined;
  const headerValue = Array.isArray(header) ? header[0] : header;
  req.clientLocale = parseAcceptLanguageHeader(headerValue);
  next();
};
