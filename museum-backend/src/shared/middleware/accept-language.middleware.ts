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

export const acceptLanguageMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  // HTTP/2 + some proxies surface as array; collapse to first preference.
  const header = req.headers['accept-language'] as string | string[] | undefined;
  const headerValue = Array.isArray(header) ? header[0] : header;
  req.clientLocale = parseAcceptLanguageHeader(headerValue);
  next();
};
