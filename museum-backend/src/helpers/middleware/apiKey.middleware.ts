import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import type { ApiKeyRepository } from '@modules/auth/core/domain/apiKey.repository.interface';
import { logger } from '@shared/logger/logger';
import { setUser } from '@shared/observability/sentry';

/** Singleton reference set during auth module initialization. */
let apiKeyRepo: ApiKeyRepository | null = null;

/** Registers the API key repository for use by the middleware. Called once at startup. */
export function setApiKeyRepository(repo: ApiKeyRepository): void {
  apiKeyRepo = repo;
}

/** Returns the currently registered API key repository (for testing). */
export function getApiKeyRepository(): ApiKeyRepository | null {
  return apiKeyRepo;
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
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key authentication not available' } });
    return;
  }

  // Prefix = chars 4..12 of the token (skip "msk_")
  const keyBody = token.substring(4); // everything after "msk_"
  if (keyBody.length < 8) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' } });
    return;
  }

  const prefix = keyBody.substring(0, 8);

  try {
    const apiKey = await apiKeyRepo.findByPrefix(prefix);
    if (!apiKey) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key has expired' } });
      return;
    }

    // Check active status
    if (!apiKey.isActive) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key has been revoked' } });
      return;
    }

    // Verify HMAC using timing-safe comparison
    const expectedHash = crypto.createHmac('sha256', apiKey.salt).update(token).digest('hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(apiKey.hash, 'hex');

    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    // Set user on request (same shape as JWT auth)
    (req as Request & { user?: { id: number } }).user = { id: apiKey.userId };
    setUser({ id: String(apiKey.userId) });

    // Update lastUsedAt asynchronously (fire-and-forget)
    apiKeyRepo.updateLastUsed(apiKey.id).catch((err) => {
      logger.warn('api_key_last_used_update_failed', { apiKeyId: apiKey.id, error: (err as Error).message });
    });

    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key validation failed' } });
  }
}
