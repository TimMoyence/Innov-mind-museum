import type { NextFunction, Request, Response } from 'express';

/** Client-requested data mode carried by the `X-Data-Mode` HTTP header. */
export type DataMode = 'low' | 'normal';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request augmentation pattern (project convention)
  namespace Express {
    interface Request {
      /**
       * Resolved client data mode, read once from the `X-Data-Mode` header.
       * Defaults to `'normal'` when absent or unrecognized, so downstream
       * handlers can treat it as a non-nullable discriminant.
       */
      dataMode?: DataMode;
    }
  }
}

const headerName = 'x-data-mode';

/**
 * Attaches `req.dataMode` on every request. Reads the `X-Data-Mode` header
 * (client-injected by the mobile Axios interceptor) and normalizes it to
 * either `'low'` or `'normal'`. Unknown values default to `'normal'` so the
 * server never degrades the experience based on a garbled header.
 */
export const dataModeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const raw = req.headers[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  req.dataMode = value === 'low' ? 'low' : 'normal';
  next();
};
