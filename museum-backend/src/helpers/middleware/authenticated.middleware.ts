import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default_secret',
    ) as any;

    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}
