import type { IAdminRepository } from '@modules/admin/domain/admin.repository.interface';
import type {
  ContentAnalytics,
  EngagementAnalytics,
  UsageAnalytics,
  AdminStats,
} from '@modules/admin/domain/admin.types';
import { GetContentAnalyticsUseCase } from '@modules/admin/useCase/getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from '@modules/admin/useCase/getEngagementAnalytics.useCase';
import { GetStatsUseCase } from '@modules/admin/useCase/getStats.useCase';
import { GetUsageAnalyticsUseCase } from '@modules/admin/useCase/getUsageAnalytics.useCase';

function makeAdminRepo(overrides: Partial<IAdminRepository> = {}): IAdminRepository {
  return {
    listUsers: jest.fn(),
    changeUserRole: jest.fn(),
    countAdmins: jest.fn(),
    listAuditLogs: jest.fn(),
    getStats: jest.fn(),
    listReports: jest.fn(),
    resolveReport: jest.fn(),
    getUsageAnalytics: jest.fn(),
    getContentAnalytics: jest.fn(),
    getEngagementAnalytics: jest.fn(),
    ...overrides,
  } as IAdminRepository;
}

describe('GetStatsUseCase', () => {
  it('delegates to repository.getStats', async () => {
    const stats: AdminStats = {
      totalUsers: 42,
      usersByRole: { visitor: 40, admin: 2 },
      totalSessions: 100,
      totalMessages: 500,
      recentSignups: 5,
      recentSessions: 20,
    };
    const repo = makeAdminRepo({ getStats: jest.fn().mockResolvedValue(stats) });
    const uc = new GetStatsUseCase(repo);

    const result = await uc.execute();

    expect(result).toEqual(stats);
    expect(repo.getStats).toHaveBeenCalledTimes(1);
  });
});

describe('GetUsageAnalyticsUseCase', () => {
  it('delegates filters to repository.getUsageAnalytics', async () => {
    const analytics: UsageAnalytics = {
      period: { from: '2026-01-01', to: '2026-01-31' },
      granularity: 'daily',
      sessionsCreated: [],
      messagesSent: [],
      activeUsers: [],
    };
    const repo = makeAdminRepo({
      getUsageAnalytics: jest.fn().mockResolvedValue(analytics),
    });
    const uc = new GetUsageAnalyticsUseCase(repo);
    const filters = { granularity: 'daily' as const, days: 30 };

    const result = await uc.execute(filters);

    expect(result).toEqual(analytics);
    expect(repo.getUsageAnalytics).toHaveBeenCalledWith(filters);
  });
});

describe('GetContentAnalyticsUseCase', () => {
  it('delegates filters to repository.getContentAnalytics', async () => {
    const analytics: ContentAnalytics = {
      topArtworks: [{ title: 'Mona Lisa', artist: 'Da Vinci', count: 10 }],
      topMuseums: [{ name: 'Louvre', count: 5 }],
      guardrailBlockRate: 0.02,
    };
    const repo = makeAdminRepo({
      getContentAnalytics: jest.fn().mockResolvedValue(analytics),
    });
    const uc = new GetContentAnalyticsUseCase(repo);
    const filters = { from: '2026-01-01', limit: 10 };

    const result = await uc.execute(filters);

    expect(result).toEqual(analytics);
    expect(repo.getContentAnalytics).toHaveBeenCalledWith(filters);
  });
});

describe('GetEngagementAnalyticsUseCase', () => {
  it('delegates filters to repository.getEngagementAnalytics', async () => {
    const analytics: EngagementAnalytics = {
      avgMessagesPerSession: 4.5,
      avgSessionDurationMinutes: 12,
      returnUserRate: 0.35,
      totalUniqueUsers: 200,
      returningUsers: 70,
    };
    const repo = makeAdminRepo({
      getEngagementAnalytics: jest.fn().mockResolvedValue(analytics),
    });
    const uc = new GetEngagementAnalyticsUseCase(repo);
    const filters = { from: '2026-03-01', to: '2026-03-31' };

    const result = await uc.execute(filters);

    expect(result).toEqual(analytics);
    expect(repo.getEngagementAnalytics).toHaveBeenCalledWith(filters);
  });
});
