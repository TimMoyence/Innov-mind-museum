import crypto from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { setUser } from '@shared/observability/sentry';

import type { ApiKeyRepository } from '@modules/auth/core/domain/apiKey.repository.interface';
import type { UserRole } from '@modules/auth/core/domain/user-role';
import type { Request, Response, NextFunction } from 'express';

/** Singleton reference set during auth module initialization. */
let apiKeyRepo: ApiKeyRepository | null = null;
let userRoleResolver: ((userId: number) => Promise<UserRole | null>) | null = null;

/** Registers the API key repository for use by the middleware. Called once at startup. */
export function setApiKeyRepository(repo: ApiKeyRepository): void {
  apiKeyRepo = repo;
}

/** Returns the currently registered API key repository (for testing). */
export function getApiKeyRepository(): ApiKeyRepository | null {
  return apiKeyRepo;
}

/** Registers a resolver to fetch the user's role for API key auth. Called once at startup. */
export function setUserRoleResolver(resolver: (userId: number) => Promise<UserRole | null>): void {
  userRoleResolver = resolver;
}

/** Sends a 401 JSON response with a standard error shape. */
function sendUnauthorized(res: Response, message: string): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
}

/** Checks whether the API key is expired or revoked. Returns an error message or null if valid. */
function checkApiKeyValidity(apiKey: {
  expiresAt?: Date | string | null;
  isActive: boolean;
}): string | null {
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return 'API key has expired';
  }
  if (!apiKey.isActive) {
    return 'API key has been revoked';
  }
  return null;
}

/** Verifies the token hash using timing-safe HMAC comparison. */
function verifyTokenHash(token: string, salt: string, storedHash: string): boolean {
  const expectedHash = crypto.createHmac('sha256', salt).update(token).digest('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(storedHash, 'hex');

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/**
 * Validates a Bearer token that starts with `msk_` against the API key store.
 * On success, sets `req.user = { id: <userId> }` and updates `lastUsedAt` asynchronously.
 *
 * @param token - The full `msk_...` token from the Authorization header.
 * @param req - Express request (mutated on success).
 * @param res - Express response (used to send 401 on failure).
 * @param next - Express next function.
 */
export async function validateApiKey(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!apiKeyRepo) {
    sendUnauthorized(res, 'API key authentication not available');
    return;
  }

  // Prefix = chars 4..12 of the token (skip "msk_")
  const keyBody = token.slice(4); // everything after "msk_"
  if (keyBody.length < 8) {
    sendUnauthorized(res, 'Invalid API key format');
    return;
  }

  const prefix = keyBody.slice(0, 8);

  try {
    const apiKey = await apiKeyRepo.findByPrefix(prefix);
    if (!apiKey) {
      sendUnauthorized(res, 'Invalid API key');
      return;
    }

    const validityError = checkApiKeyValidity(apiKey);
    if (validityError) {
      sendUnauthorized(res, validityError);
      return;
    }

    if (!verifyTokenHash(token, apiKey.salt, apiKey.hash)) {
      sendUnauthorized(res, 'Invalid API key');
      return;
    }

    // Resolve user role (defaults to visitor if resolver unavailable)
    let role: UserRole = 'visitor';
    if (userRoleResolver) {
      const resolved = await userRoleResolver(apiKey.userId);
      if (resolved) role = resolved;
    }

    // Set user on request (same shape as JWT auth)
    const museumId = (apiKey as { museumId?: number | null }).museumId ?? null;
    (req as Request & { user?: { id: number; role: UserRole; museumId?: number | null } }).user = {
      id: apiKey.userId,
      role,
      museumId,
    };
    req.museumId = museumId ?? undefined;
    setUser({ id: String(apiKey.userId) });

    // Update lastUsedAt asynchronously (fire-and-forget)
    apiKeyRepo.updateLastUsed(apiKey.id).catch((err: unknown) => {
      logger.warn('api_key_last_used_update_failed', {
        apiKeyId: apiKey.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    next();
  } catch {
    sendUnauthorized(res, 'API key validation failed');
  }
}
