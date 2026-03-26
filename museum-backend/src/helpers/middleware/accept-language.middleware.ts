import { parseAcceptLanguageHeader } from '@shared/i18n/locale';

import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clientLocale?: string;
    }
  }
}

/**
 * Express middleware that parses the `Accept-Language` header and
 * attaches the first-preference language tag to `req.clientLocale`.
 */
export const acceptLanguageMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers['accept-language'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  req.clientLocale = parseAcceptLanguageHeader(headerValue);
  next();
};
