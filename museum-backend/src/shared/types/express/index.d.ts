import { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';

/** Augments the Express Request with authentication and tracing fields. */
declare global {
  namespace Express {
    interface Request {
      /** Authenticated user payload, set by the isAuthenticated middleware. */
      user?: UserJwtPayload;
      /** Unique request trace ID, set by the requestIdMiddleware. */
      requestId?: string;
    }
  }
}

export {};
