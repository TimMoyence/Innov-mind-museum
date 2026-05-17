import type { NextFunction, Request, Response } from 'express';

export type DataMode = 'low' | 'normal';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express Request augmentation pattern (project convention)
  namespace Express {
    interface Request {
      /** Defaults to 'normal' when absent/unrecognized — non-nullable discriminant downstream. */
      dataMode?: DataMode;
    }
  }
}

const headerName = 'x-data-mode';

/** Unknown values default to 'normal' — never degrade UX on garbled header. */
export const dataModeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const raw = req.headers[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  req.dataMode = value === 'low' ? 'low' : 'normal';
  next();
};
