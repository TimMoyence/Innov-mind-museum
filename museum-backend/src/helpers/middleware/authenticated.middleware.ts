import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '@src/config/env';

export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionUser = req.user as { id?: number } | undefined;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token && sessionUser?.id) {
    next();
    return;
  }
  if (!token && typeof req.isAuthenticated === 'function' && req.isAuthenticated()) {
    next();
    return;
  }
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.auth.jwtSecret) as Express.Request['user'];

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
