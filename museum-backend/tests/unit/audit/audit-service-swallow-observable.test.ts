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

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [capturedError, context] = mockCapture.mock.calls[0];
    expect(capturedError).toBe(insertError);
    expect(context).toMatchObject({ action: AUDIT_ACCOUNT_DELETED });
  });
});
