import { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';

declare global {
  namespace Express {
    interface Request {
      user?: UserJwtPayload;
    }
  }
}

export {};
