import { parseAcceptLanguageHeader } from '@shared/i18n/locale';

import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request augmentation requires the namespace pattern
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
  // Some HTTP/2 setups and certain proxies surface `accept-language` as an
  // array; collapse to the first preference. Cast: `req.headers[name]` resolves
  // to `any` under some @types/express versions despite IncomingHttpHeaders.
  const header = req.headers['accept-language'] as string | string[] | undefined;
  const headerValue = Array.isArray(header) ? header[0] : header;
  req.clientLocale = parseAcceptLanguageHeader(headerValue);
  next();
};
