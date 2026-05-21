jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

jest.mock('@src/config/env', () => ({
  env: { nodeEnv: 'test', auth: { passwordBreachCheckEnabled: false } },
}));

import { ForgotPasswordUseCase } from '@modules/auth/useCase/password/forgotPassword.useCase';
import { auditLoginError } from '@modules/auth/adapters/primary/http/helpers/login-handler.helpers';
import { auditService } from '@shared/audit';
import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';

import type { Request } from 'express';

/**
 * RED (UFR-022) — A1 / spec R2.
 * Auth log + audit-metadata sinks must NOT carry the raw/full email address; they
 * must carry only the domain (`emailDomain`, via extractEmailDomain) or omit the
 * field. Today these sinks still write `{ email: <full address> }`, so every
 * assertion below is RED until the GREEN phase rewrites the payloads.
 *
 * Contract asserted:
 *  - no emitted payload value equals or contains the full `<local>@<domain>` address
 *  - the domain-only field `emailDomain` is present and equals the domain
 */

const TEST_EMAIL = 'victim.user@example.com';
const TEST_DOMAIN = 'example.com';

const loggerMock = logger as unknown as Record<'warn' | 'error', jest.Mock>;
const auditLogMock = auditService.log as jest.Mock;

/** Asserts no value in the payload is, or contains, the full raw email. */
const expectNoRawEmail = (payload: Record<string, unknown>): void => {
  for (const value of Object.values(payload)) {
    if (typeof value === 'string') {
      expect(value).not.toBe(TEST_EMAIL);
      expect(value.includes(TEST_EMAIL)).toBe(false);
    }
  }
  expect(payload).not.toHaveProperty('email', TEST_EMAIL);
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('A1 — forgotPassword.useCase log sinks carry domain only (R2)', () => {
  it('forgot_password_unverified_skipped logs emailDomain, not raw email', async () => {
    const user = makeUser({ email: TEST_EMAIL, email_verified: false });
    const repo = makeUserRepo(user);
    const useCase = new ForgotPasswordUseCase(repo);

    await useCase.execute(TEST_EMAIL);

    const call = loggerMock.warn.mock.calls.find(
      ([msg]) => msg === 'forgot_password_unverified_skipped',
    );
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expectNoRawEmail(payload);
    expect(payload.emailDomain).toBe(TEST_DOMAIN);
  });

  it('forgot_password_email_skipped_no_service logs emailDomain, not raw email', async () => {
    const user = makeUser({ email: TEST_EMAIL, email_verified: true });
    const repo = makeUserRepo(user);
    // No email service / frontend URL → falls into the skipped-no-service branch.
    const useCase = new ForgotPasswordUseCase(repo);

    await useCase.execute(TEST_EMAIL);

    const call = [...loggerMock.warn.mock.calls, ...loggerMock.error.mock.calls].find(
      ([msg]) => msg === 'forgot_password_email_skipped_no_service',
    );
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expectNoRawEmail(payload);
    expect(payload.emailDomain).toBe(TEST_DOMAIN);
  });

  it('forgot_password_email_failed logs emailDomain, not raw email', async () => {
    const user = makeUser({ email: TEST_EMAIL, email_verified: true });
    const repo = makeUserRepo(user);
    const emailService = { sendEmail: jest.fn().mockRejectedValue(new Error('SMTP down')) };
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://app.example.com');

    await useCase.execute(TEST_EMAIL);

    const call = loggerMock.warn.mock.calls.find(([msg]) => msg === 'forgot_password_email_failed');
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expectNoRawEmail(payload);
    expect(payload.emailDomain).toBe(TEST_DOMAIN);
  });
});

describe('A1 — auditLoginError metadata carries domain only (R2)', () => {
  const makeReq = (): Request =>
    ({
      body: { email: TEST_EMAIL },
      ip: '203.0.113.7',
      requestId: 'req-test-1',
    }) as unknown as Request;

  it('INVALID_CREDENTIALS audit metadata has emailDomain, not raw email', async () => {
    const error = new AppError({
      message: 'bad creds',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

    await auditLoginError(makeReq(), error);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const event = auditLogMock.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expectNoRawEmail(event.metadata);
    expect(event.metadata.emailDomain).toBe(TEST_DOMAIN);
  });

  it('TOO_MANY_REQUESTS audit metadata has emailDomain, not raw email', async () => {
    const error = new AppError({
      message: 'rate limited',
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await auditLoginError(makeReq(), error);

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const event = auditLogMock.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expectNoRawEmail(event.metadata);
    expect(event.metadata.emailDomain).toBe(TEST_DOMAIN);
    // endpoint tag preserved (R2 omits only the raw email, keeps forensic context).
    expect(event.metadata.endpoint).toBe('/login');
  });
});
