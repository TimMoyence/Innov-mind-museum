/**
 * RED (T1.2 — Cycle D, R4) — a swallowed audit insert failure must be OBSERVABLE.
 *
 * `AuditService.log()` swallows a repository insert failure on purpose (an audit
 * outage must never break the user request — `audit.service.ts:109-117`). But a
 * REAL account deletion whose `ACCOUNT_DELETED` row silently fails to persist is
 * a forensic black hole: the deletion happened, no trace exists (spec §1.1, R4,
 * design §1). The fix routes that swallowed failure to Sentry
 * (`captureExceptionWithContext`) IN ADDITION to the existing
 * `logger.error('audit_log_failed')`, WITHOUT rethrowing (the no-throw contract
 * stays).
 *
 * RED at baseline: `audit.service.ts` `log()` catch only calls
 * `logger.error('audit_log_failed', …)` — it does NOT import or call
 * `captureExceptionWithContext`. So the Sentry-capture assertion fails while the
 * no-throw assertion already passes.
 */
import { AuditService } from '@shared/audit/audit.service';
import { AUDIT_ACCOUNT_DELETED } from '@shared/audit/audit.types';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { makeAuditRepo } from '../../helpers/audit/repo.fixtures';

import type { AuditLogEntry } from '@shared/audit/audit.types';

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCapture = captureExceptionWithContext as jest.MockedFunction<
  typeof captureExceptionWithContext
>;

describe('AuditService.log — swallowed insert failure is observable (R4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does NOT throw when the repository insert rejects (no-throw contract preserved)', async () => {
    const repo = makeAuditRepo({
      insert: jest.fn().mockRejectedValue(new Error('chain lock timeout')),
    });
    const service = new AuditService(repo);

    const entry: AuditLogEntry = {
      action: AUDIT_ACCOUNT_DELETED,
      actorType: 'user',
      actorId: 42,
      targetType: 'user',
      targetId: '42',
    };

    // Must resolve, never reject — a user delete request must not 500 because
    // the audit row failed to persist.
    await expect(service.log(entry)).resolves.toBeUndefined();
  });

  it('captures the failed ACCOUNT_DELETED insert to Sentry so a silent deletion is detectable (R4)', async () => {
    const insertError = new Error('chain lock timeout');
    const repo = makeAuditRepo({
      insert: jest.fn().mockRejectedValue(insertError),
    });
    const service = new AuditService(repo);

    await service.log({
      action: AUDIT_ACCOUNT_DELETED,
      actorType: 'user',
      actorId: 42,
      targetType: 'user',
      targetId: '42',
    });

    // A swallowed ACCOUNT_DELETED insert failure MUST be routed to Sentry.
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [capturedError, context] = mockCapture.mock.calls[0];
    expect(capturedError).toBe(insertError);
    // Context must identify the failed audit action — no PII (just the action).
    expect(context).toMatchObject({ action: AUDIT_ACCOUNT_DELETED });
  });
});
