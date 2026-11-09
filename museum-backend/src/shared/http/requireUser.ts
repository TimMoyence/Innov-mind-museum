import { unauthorized } from '@shared/errors/app.error';

import type { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';
import type { Request } from 'express';

export function requireUser(req: Request): UserJwtPayload {
  const user = req.user;
  if (!user?.id) {
    throw unauthorized('Authentication required');
  }
  return user;
}
