import crypto from 'node:crypto';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { setUser } from '@shared/observability/sentry';

import type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { Request, Response, NextFunction } from 'express';

let apiKeyRepo: ApiKeyRepository | null = null;
let userRoleResolver: ((userId: number) => Promise<UserRole | null>) | null = null;

export function setApiKeyRepository(repo: ApiKeyRepository): void {
  apiKeyRepo = repo;
}

export function getApiKeyRepository(): ApiKeyRepository | null {
  return apiKeyRepo;
}

export function setUserRoleResolver(
  resolver: ((userId: number) => Promise<UserRole | null>) | null,
): void {
  userRoleResolver = resolver;
}

const unauthorized = (message: string): AppError =>
  new AppError({ message, statusCode: 401, code: 'UNAUTHORIZED' });

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

/** SEC: timing-safe HMAC comparison. */
function verifyTokenHash(token: string, salt: string, storedHash: string): boolean {
  const expectedHash = crypto.createHmac('sha256', salt).update(token).digest('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(storedHash, 'hex');

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/** Mutates `req.user` on success; fire-and-forget `lastUsedAt` update. */
export async function validateApiKey(
  token: string,
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!apiKeyRepo) {
    throw unauthorized('API key authentication not available');
  }

  // Prefix = chars 4..12 (skip "msk_").
  const keyBody = token.slice(4);
  if (keyBody.length < 8) {
    throw unauthorized('Invalid API key format');
  }

  const prefix = keyBody.slice(0, 8);

  try {
    const apiKey = await apiKeyRepo.findByPrefix(prefix);
    if (!apiKey) {
      throw unauthorized('Invalid API key');
    }

    const validityError = checkApiKeyValidity(apiKey);
    if (validityError) {
      throw unauthorized(validityError);
    }

    if (!verifyTokenHash(token, apiKey.salt, apiKey.hash)) {
      throw unauthorized('Invalid API key');
    }

    let role: UserRole = 'visitor';
    if (userRoleResolver) {
      const resolved = await userRoleResolver(apiKey.userId);
      if (resolved) role = resolved;
    }

    const museumId = (apiKey as { museumId?: number | null }).museumId ?? null;
    req.user = {
      id: apiKey.userId,
      role,
      museumId,
    };
    req.museumId = museumId ?? undefined;
    setUser({ id: String(apiKey.userId) });

    apiKeyRepo.updateLastUsed(apiKey.id).catch((err: unknown) => {
      logger.warn('api_key_last_used_update_failed', {
        apiKeyId: apiKey.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    next();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unauthorized('API key validation failed');
  }
}
