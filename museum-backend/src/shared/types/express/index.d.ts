import type { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';

/** Augments the Express Request with authentication and tracing fields. */
declare global {
  namespace Express {
    interface Request {
      /** Authenticated user payload, set by the isAuthenticated middleware. */
      user?: UserJwtPayload;
      /** Unique request trace ID, set by the requestIdMiddleware. */
      requestId?: string;
      /** Museum tenant context, resolved by tenant middleware or auth. */
      museumId?: number | null;
      /**
       * Parsed cookies, populated by `cookieParserMiddleware` (F7 2026-04-30).
       * Always defined (empty object when no Cookie header was sent).
       */
      cookies: Record<string, string>;
    }
  }
}

export {};
