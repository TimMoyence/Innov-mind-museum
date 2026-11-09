import type { NextFunction, Request, Response } from 'express';

export type DataMode = 'low' | 'normal';

declare module 'express-serve-static-core' {
  interface Request {
    dataMode?: DataMode;
  }
}

const headerName = 'x-data-mode';

export const dataModeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const raw = req.headers[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  req.dataMode = value === 'low' ? 'low' : 'normal';
  next();
};
