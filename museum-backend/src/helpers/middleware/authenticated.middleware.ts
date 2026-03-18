import { Request, Response, NextFunction } from 'express';
import { authSessionService } from '@modules/auth/core/useCase';

/** Extracts and validates the Bearer JWT from the Authorization header. @throws {401} if token is missing or invalid. */
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }

  try {
    const user = authSessionService.verifyAccessToken(token);
    (
      req as Request & {
        user?: {
          id?: number;
          email?: string;
          firstname?: string;
          lastname?: string;
        };
      }
    ).user = {
      ...user,
      firstname: user.firstname ?? undefined,
      lastname: user.lastname ?? undefined,
    };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
