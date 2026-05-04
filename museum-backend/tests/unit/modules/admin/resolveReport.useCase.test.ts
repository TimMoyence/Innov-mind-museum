import { ResolveReportUseCase } from '@modules/admin/useCase/reports/resolveReport.useCase';
import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import { makeAdminRepo } from 'tests/helpers/admin/repo.fixtures';

// Silence audit logging
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_REPORT_RESOLVED: 'ADMIN_REPORT_RESOLVED',
}));

const fakeReport = {
  id: 'report-1',
  messageId: 'msg-1',
  reason: 'offensive',
  status: 'reviewed',
  reportedBy: 10,
  reviewedBy: 1,
  createdAt: new Date().toISOString(),
};

const mockRepo = (overrides: Partial<IAdminRepository> = {}): IAdminRepository =>
  makeAdminRepo({
    resolveReport: jest.fn().mockResolvedValue(fakeReport),
    ...overrides,
  });

describe('ResolveReportUseCase', () => {
  it('throws for invalid status', async () => {
    const useCase = new ResolveReportUseCase(mockRepo());
    await expect(
      useCase.execute({
        reportId: 'r1',
        status: 'invalid_status',
        reviewedBy: 1,
      }),
    ).rejects.toThrow('Invalid status');
  });

  it('throws NOT_FOUND when repository returns null', async () => {
    const repo = mockRepo({ resolveReport: jest.fn().mockResolvedValue(null) });
    const useCase = new ResolveReportUseCase(repo);
    await expect(
      useCase.execute({
        reportId: 'nonexistent',
        status: 'reviewed',
        reviewedBy: 1,
      }),
    ).rejects.toThrow('Report not found');
  });

  it('resolves report with "reviewed" status', async () => {
    const repo = mockRepo();
    const useCase = new ResolveReportUseCase(repo);
    const result = await useCase.execute({
      reportId: 'r1',
      status: 'reviewed',
      reviewedBy: 1,
      reviewerNotes: 'Looks fine',
    });

    expect(result).toEqual(fakeReport);
    expect(repo.resolveReport).toHaveBeenCalledWith({
      reportId: 'r1',
      status: 'reviewed',
      reviewerNotes: 'Looks fine',
      reviewedBy: 1,
    });
  });

  it('resolves report with "dismissed" status', async () => {
    const repo = mockRepo();
    const useCase = new ResolveReportUseCase(repo);
    const result = await useCase.execute({
      reportId: 'r2',
      status: 'dismissed',
      reviewedBy: 2,
    });

    expect(result).toEqual(fakeReport);
  });

  it('resolves report with "pending" status', async () => {
    const repo = mockRepo();
    const useCase = new ResolveReportUseCase(repo);
    const result = await useCase.execute({
      reportId: 'r3',
      status: 'pending',
      reviewedBy: 3,
    });

    expect(result).toEqual(fakeReport);
  });
});
