import type { DataSource, Repository } from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
import { AuditLog } from '@shared/audit/auditLog.entity';

import { AdminRepositoryPg } from '@modules/admin/adapters/secondary/admin.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';

// ─── QueryBuilder mock factory ───
function makeMockQb() {
  const qb: Record<string, jest.Mock> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getCount: jest.fn(),
    getManyAndCount: jest.fn(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    limit: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    distinctOn: jest.fn().mockReturnThis(),
  };
  return qb;
}

// ─── Report factory ───
function makeReport(overrides: Partial<MessageReport> = {}): MessageReport {
  return {
    id: 'report-001',
    messageId: 'msg-001',
    userId: 1,
    reason: 'offensive',
    comment: null,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewerNotes: null,
    createdAt: new Date('2025-06-01'),
    message: {
      id: 'msg-001',
      text: 'Bad content',
      role: 'assistant',
      sessionId: 'session-001',
    } as ChatMessage,
    ...overrides,
  } as MessageReport;
}

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-001',
    action: 'USER_LOGIN',
    actorType: 'user',
    actorId: 1,
    targetType: null,
    targetId: null,
    metadata: null,
    ip: '127.0.0.1',
    requestId: null,
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as AuditLog;
}

function buildMocks() {
  const userQb = makeMockQb();
  const auditQb = makeMockQb();
  const reportQb = makeMockQb();
  const sessionQb = makeMockQb();
  const messageQb = makeMockQb();

  const userRepo = {
    findOneBy: jest.fn(),
    save: jest.fn(),
    countBy: jest.fn(),
    createQueryBuilder: jest.fn(() => userQb),
  } as unknown as jest.Mocked<Repository<User>>;

  const auditRepo = {
    createQueryBuilder: jest.fn(() => auditQb),
  } as unknown as jest.Mocked<Repository<AuditLog>>;

  const reportRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => reportQb),
  } as unknown as jest.Mocked<Repository<MessageReport>>;

  const sessionRepo = {
    createQueryBuilder: jest.fn(() => sessionQb),
  } as unknown as jest.Mocked<Repository<ChatSession>>;

  const messageRepo = {
    createQueryBuilder: jest.fn(() => messageQb),
  } as unknown as jest.Mocked<Repository<ChatMessage>>;

  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === User) return userRepo;
      if (entity === AuditLog) return auditRepo;
      if (entity === MessageReport) return reportRepo;
      if (entity === ChatSession) return sessionRepo;
      if (entity === ChatMessage) return messageRepo;
      return userRepo;
    }),
    // For getContentAnalytics which calls this.dataSource.getRepository(ArtworkMatch)
    query: jest.fn(),
  } as unknown as DataSource;

  return {
    userRepo,
    auditRepo,
    reportRepo,
    sessionRepo,
    messageRepo,
    userQb,
    auditQb,
    reportQb,
    sessionQb,
    messageQb,
    dataSource,
  };
}

describe('AdminRepositoryPg', () => {
  let sut: AdminRepositoryPg;
  let userRepo: jest.Mocked<Repository<User>>;
  let reportRepo: jest.Mocked<Repository<MessageReport>>;
  let userQb: ReturnType<typeof makeMockQb>;
  let auditQb: ReturnType<typeof makeMockQb>;
  let reportQb: ReturnType<typeof makeMockQb>;
  let sessionQb: ReturnType<typeof makeMockQb>;
  let messageQb: ReturnType<typeof makeMockQb>;
  let dataSource: DataSource;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    userRepo = mocks.userRepo;
    reportRepo = mocks.reportRepo;
    userQb = mocks.userQb;
    auditQb = mocks.auditQb;
    reportQb = mocks.reportQb;
    sessionQb = mocks.sessionQb;
    messageQb = mocks.messageQb;
    dataSource = mocks.dataSource;
    sut = new AdminRepositoryPg(dataSource);
  });

  // ─── listUsers ───
  describe('listUsers', () => {
    it('returns paginated users without filters', async () => {
      const users = [makeUser({ id: 1 }), makeUser({ id: 2 })];
      userQb.getManyAndCount.mockResolvedValue([users, 2]);

      const result = await sut.listUsers({
        pagination: { page: 1, limit: 10 },
      });

      expect(userQb.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
      expect(userQb.skip).toHaveBeenCalledWith(0);
      expect(userQb.take).toHaveBeenCalledWith(10);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('applies search filter with ILIKE', async () => {
      userQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listUsers({
        search: 'john',
        pagination: { page: 1, limit: 10 },
      });

      expect(userQb.where).toHaveBeenCalledWith(
        '(user.email ILIKE :search OR user.firstname ILIKE :search OR user.lastname ILIKE :search)',
        { search: '%john%' },
      );
    });

    it('applies role filter', async () => {
      userQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listUsers({
        role: 'admin',
        pagination: { page: 1, limit: 10 },
      });

      expect(userQb.andWhere).toHaveBeenCalledWith('user.role = :role', { role: 'admin' });
    });

    it('computes correct offset and totalPages for page 2', async () => {
      userQb.getManyAndCount.mockResolvedValue([[], 25]);

      const result = await sut.listUsers({
        pagination: { page: 2, limit: 10 },
      });

      expect(userQb.skip).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(3);
    });

    it('maps user entity to AdminUserDTO with ISO dates', async () => {
      const user = makeUser({
        id: 1,
        email: 'test@test.com',
        firstname: 'Jane',
        lastname: 'Doe',
        role: 'visitor',
        email_verified: true,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      userQb.getManyAndCount.mockResolvedValue([[user], 1]);

      const result = await sut.listUsers({ pagination: { page: 1, limit: 10 } });

      expect(result.data[0]).toEqual({
        id: 1,
        email: 'test@test.com',
        firstname: 'Jane',
        lastname: 'Doe',
        role: 'visitor',
        emailVerified: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-06-01T00:00:00.000Z',
      });
    });
  });

  // ─── changeUserRole ───
  describe('changeUserRole', () => {
    it('updates role and returns user DTO', async () => {
      const user = makeUser({ role: 'visitor' });
      userRepo.findOneBy.mockResolvedValue(user);
      const savedUser = makeUser({ role: 'admin' });
      userRepo.save.mockResolvedValue(savedUser);

      const result = await sut.changeUserRole(1, 'admin');

      expect(user.role).toBe('admin');
      expect(userRepo.save).toHaveBeenCalledWith(user);
      expect(result).toBeDefined();
      expect(result?.role).toBe('admin');
    });

    it('returns null when user not found', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      const result = await sut.changeUserRole(999, 'admin');

      expect(result).toBeNull();
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── countAdmins ───
  describe('countAdmins', () => {
    it('returns count of admin users', async () => {
      userRepo.countBy.mockResolvedValue(3);

      const result = await sut.countAdmins();

      expect(result).toBe(3);
      expect(userRepo.countBy).toHaveBeenCalledWith({ role: 'admin' });
    });
  });

  // ─── listAuditLogs ───
  describe('listAuditLogs', () => {
    it('returns paginated audit logs without filters', async () => {
      const logs = [makeAuditLog()];
      auditQb.getManyAndCount.mockResolvedValue([logs, 1]);

      const result = await sut.listAuditLogs({
        pagination: { page: 1, limit: 20 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('USER_LOGIN');
      expect(typeof result.data[0].createdAt).toBe('string');
    });

    it('applies action filter', async () => {
      auditQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listAuditLogs({
        action: 'USER_LOGIN',
        pagination: { page: 1, limit: 10 },
      });

      expect(auditQb.andWhere).toHaveBeenCalledWith('log.action = :action', {
        action: 'USER_LOGIN',
      });
    });

    it('applies actorId filter', async () => {
      auditQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listAuditLogs({
        actorId: 5,
        pagination: { page: 1, limit: 10 },
      });

      expect(auditQb.andWhere).toHaveBeenCalledWith('log.actorId = :actorId', { actorId: 5 });
    });

    it('applies targetType filter', async () => {
      auditQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listAuditLogs({
        targetType: 'user',
        pagination: { page: 1, limit: 10 },
      });

      expect(auditQb.andWhere).toHaveBeenCalledWith('log.targetType = :targetType', {
        targetType: 'user',
      });
    });

    it('applies date range filters', async () => {
      auditQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listAuditLogs({
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        pagination: { page: 1, limit: 10 },
      });

      expect(auditQb.andWhere).toHaveBeenCalledWith('log.createdAt >= :dateFrom', {
        dateFrom: '2025-01-01',
      });
      expect(auditQb.andWhere).toHaveBeenCalledWith('log.createdAt <= :dateTo', {
        dateTo: '2025-12-31',
      });
    });
  });

  // ─── getStats ───
  describe('getStats', () => {
    it('returns aggregated stats from all tables', async () => {
      // Users by role
      userQb.getRawMany.mockResolvedValue([
        { role: 'visitor', total: '100', recent: '10' },
        { role: 'admin', total: '5', recent: '1' },
      ]);
      // Sessions
      sessionQb.getRawOne.mockResolvedValue({ total: '500', recent: '50' });
      // Messages
      messageQb.getRawOne.mockResolvedValue({ total: '2000' });

      const result = await sut.getStats();

      expect(result).toEqual({
        totalUsers: 105,
        usersByRole: { visitor: 100, admin: 5 },
        totalSessions: 500,
        totalMessages: 2000,
        recentSignups: 11,
        recentSessions: 50,
      });
    });

    it('handles null/missing results gracefully', async () => {
      userQb.getRawMany.mockResolvedValue([]);
      sessionQb.getRawOne.mockResolvedValue(null);
      messageQb.getRawOne.mockResolvedValue(null);

      const result = await sut.getStats();

      expect(result.totalUsers).toBe(0);
      expect(result.totalSessions).toBe(0);
      expect(result.totalMessages).toBe(0);
    });
  });

  // ─── listReports ───
  describe('listReports', () => {
    it('returns paginated reports with message data', async () => {
      const reports = [makeReport()];
      reportQb.getManyAndCount.mockResolvedValue([reports, 1]);

      const result = await sut.listReports({
        pagination: { page: 1, limit: 10 },
      });

      expect(reportQb.leftJoinAndSelect).toHaveBeenCalledWith('report.message', 'message');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].messageText).toBe('Bad content');
      expect(result.data[0].messageRole).toBe('assistant');
      expect(result.data[0].sessionId).toBe('session-001');
    });

    it('applies status filter', async () => {
      reportQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listReports({
        status: 'pending',
        pagination: { page: 1, limit: 10 },
      });

      expect(reportQb.andWhere).toHaveBeenCalledWith('report.status = :status', {
        status: 'pending',
      });
    });

    it('applies reason filter', async () => {
      reportQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listReports({
        reason: 'offensive',
        pagination: { page: 1, limit: 10 },
      });

      expect(reportQb.andWhere).toHaveBeenCalledWith('report.reason = :reason', {
        reason: 'offensive',
      });
    });

    it('applies date range filters', async () => {
      reportQb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listReports({
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        pagination: { page: 1, limit: 10 },
      });

      expect(reportQb.andWhere).toHaveBeenCalledWith('report.createdAt >= :dateFrom', {
        dateFrom: '2025-01-01',
      });
      expect(reportQb.andWhere).toHaveBeenCalledWith('report.createdAt <= :dateTo', {
        dateTo: '2025-12-31',
      });
    });
  });

  // ─── resolveReport ───
  describe('resolveReport', () => {
    it('updates report status and reviewer info', async () => {
      const report = makeReport();
      reportRepo.findOne.mockResolvedValue(report);
      reportRepo.save.mockResolvedValue(report);

      const result = await sut.resolveReport({
        reportId: 'report-001',
        status: 'reviewed',
        reviewedBy: 10,
        reviewerNotes: 'Looks fine',
      });

      expect(report.status).toBe('reviewed');
      expect(report.reviewedBy).toBe(10);
      expect(report.reviewerNotes).toBe('Looks fine');
      expect(report.reviewedAt).toBeInstanceOf(Date);
      expect(result).toBeDefined();
    });

    it('returns null when report not found', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      const result = await sut.resolveReport({
        reportId: 'nonexistent',
        status: 'dismissed',
        reviewedBy: 10,
      });

      expect(result).toBeNull();
    });

    it('sets reviewerNotes to null when not provided', async () => {
      const report = makeReport();
      reportRepo.findOne.mockResolvedValue(report);
      reportRepo.save.mockResolvedValue(report);

      await sut.resolveReport({
        reportId: 'report-001',
        status: 'reviewed',
        reviewedBy: 10,
      });

      expect(report.reviewerNotes).toBeNull();
    });
  });

  // ─── getUsageAnalytics ───
  describe('getUsageAnalytics', () => {
    it('returns time-series data with daily granularity', async () => {
      sessionQb.getRawMany
        .mockResolvedValueOnce([{ d: new Date('2025-06-01'), c: '10' }])
        .mockResolvedValueOnce([{ d: new Date('2025-06-01'), c: '5' }]);
      messageQb.getRawMany.mockResolvedValue([{ d: new Date('2025-06-01'), c: '50' }]);

      const result = await sut.getUsageAnalytics({ granularity: 'daily' });

      expect(result.granularity).toBe('daily');
      expect(result.sessionsCreated).toHaveLength(1);
      expect(result.sessionsCreated[0]).toEqual({ date: '2025-06-01', count: 10 });
      expect(result.messagesSent).toHaveLength(1);
      expect(result.activeUsers).toHaveLength(1);
    });

    it('uses default granularity and days when not specified', async () => {
      sessionQb.getRawMany.mockResolvedValue([]);
      messageQb.getRawMany.mockResolvedValue([]);

      const result = await sut.getUsageAnalytics({});

      expect(result.granularity).toBe('daily');
      expect(result.period.from).toBeTruthy();
      expect(result.period.to).toBeTruthy();
    });

    it('uses from/to dates when provided', async () => {
      sessionQb.getRawMany.mockResolvedValue([]);
      messageQb.getRawMany.mockResolvedValue([]);

      const result = await sut.getUsageAnalytics({
        from: '2025-01-01',
        to: '2025-06-30',
      });

      expect(result.period.from).toBe('2025-01-01');
      expect(result.period.to).toBe('2025-06-30');
    });
  });

  // ─── getContentAnalytics ───
  describe('getContentAnalytics', () => {
    it('returns top artworks, museums, and guardrail rate', async () => {
      // The method uses this.dataSource.getRepository(ArtworkMatch) directly
      // which returns a repo with its own query builder
      const artworkQb = makeMockQb();
      artworkQb.getRawMany.mockResolvedValue([
        { title: 'Mona Lisa', artist: 'Da Vinci', c: '100' },
      ]);

      // Museum query uses sessionQb
      sessionQb.getRawMany.mockResolvedValue([{ name: 'Louvre', c: '50' }]);

      // Guardrail queries use auditQb
      // Two separate createQueryBuilder calls: total and blocked
      const totalQb = makeMockQb();
      totalQb.getRawOne.mockResolvedValue({ total: '1000' });
      const blockedQb = makeMockQb();
      blockedQb.getRawOne.mockResolvedValue({ total: '10' });

      // Override auditRepo to return different qbs
      const auditRepo = dataSource.getRepository(AuditLog) as unknown as jest.Mocked<
        Repository<AuditLog>
      >;
      auditRepo.createQueryBuilder
        .mockReturnValueOnce(totalQb as never)
        .mockReturnValueOnce(blockedQb as never);

      // Override dataSource.getRepository for ArtworkMatch
      const origGetRepo = dataSource.getRepository as jest.Mock;
      origGetRepo.mockImplementation((entity: unknown) => {
        if (entity === User) return { createQueryBuilder: jest.fn(() => userQb) };
        if (entity === AuditLog) return auditRepo;
        if (entity === MessageReport) return { createQueryBuilder: jest.fn(() => reportQb) };
        if (entity === ChatSession) return { createQueryBuilder: jest.fn(() => sessionQb) };
        if (entity === ChatMessage) return { createQueryBuilder: jest.fn(() => messageQb) };
        // ArtworkMatch or anything else
        return { createQueryBuilder: jest.fn(() => artworkQb) };
      });

      // Re-instantiate to pick up new getRepository behavior
      sut = new AdminRepositoryPg(dataSource);

      const result = await sut.getContentAnalytics({});

      expect(result.topArtworks).toHaveLength(1);
      expect(result.topArtworks[0]).toEqual({
        title: 'Mona Lisa',
        artist: 'Da Vinci',
        count: 100,
      });
      expect(result.topMuseums).toHaveLength(1);
      expect(result.topMuseums[0]).toEqual({ name: 'Louvre', count: 50 });
      expect(result.guardrailBlockRate).toBeCloseTo(0.01);
    });

    it('returns 0 guardrail rate when no audit logs', async () => {
      const artworkQb = makeMockQb();
      artworkQb.getRawMany.mockResolvedValue([]);
      sessionQb.getRawMany.mockResolvedValue([]);

      const totalQb = makeMockQb();
      totalQb.getRawOne.mockResolvedValue({ total: '0' });
      const blockedQb = makeMockQb();
      blockedQb.getRawOne.mockResolvedValue({ total: '0' });

      const auditRepo = dataSource.getRepository(AuditLog) as unknown as jest.Mocked<
        Repository<AuditLog>
      >;
      auditRepo.createQueryBuilder
        .mockReturnValueOnce(totalQb as never)
        .mockReturnValueOnce(blockedQb as never);

      const origGetRepo = dataSource.getRepository as jest.Mock;
      origGetRepo.mockImplementation((entity: unknown) => {
        if (entity === AuditLog) return auditRepo;
        if (entity === ChatSession) return { createQueryBuilder: jest.fn(() => sessionQb) };
        return { createQueryBuilder: jest.fn(() => artworkQb) };
      });

      sut = new AdminRepositoryPg(dataSource);

      const result = await sut.getContentAnalytics({});

      expect(result.guardrailBlockRate).toBe(0);
    });
  });

  // ─── getEngagementAnalytics ───
  describe('getEngagementAnalytics', () => {
    it('returns engagement metrics', async () => {
      sessionQb.getRawOne
        .mockResolvedValueOnce({ avg_msg: '3.5' })
        .mockResolvedValueOnce({ avg_dur: '12.5' })
        .mockResolvedValueOnce({ total_unique: '100' });

      // Raw query for returning users
      (dataSource.query as jest.Mock).mockResolvedValue([{ returning_users: '30' }]);

      // Need fresh qbs for the subquery-based calls
      const freshSessionQb1 = makeMockQb();
      freshSessionQb1.getRawOne.mockResolvedValue({ avg_msg: '3.5' });
      freshSessionQb1.from.mockReturnValue(freshSessionQb1);

      const freshSessionQb2 = makeMockQb();
      freshSessionQb2.getRawOne.mockResolvedValue({ avg_dur: '12.5' });

      const freshSessionQb3 = makeMockQb();
      freshSessionQb3.getRawOne.mockResolvedValue({ total_unique: '100' });

      const sessionRepoMock = dataSource.getRepository(ChatSession) as unknown as jest.Mocked<
        Repository<ChatSession>
      >;
      sessionRepoMock.createQueryBuilder
        .mockReturnValueOnce(freshSessionQb1 as never)
        .mockReturnValueOnce(freshSessionQb2 as never)
        .mockReturnValueOnce(freshSessionQb3 as never);

      sut = new AdminRepositoryPg(dataSource);

      const result = await sut.getEngagementAnalytics({});

      expect(result.avgMessagesPerSession).toBe(3.5);
      expect(result.avgSessionDurationMinutes).toBe(12.5);
      expect(result.totalUniqueUsers).toBe(100);
      expect(result.returningUsers).toBe(30);
      expect(result.returnUserRate).toBeCloseTo(0.3);
    });

    it('returns zeros when no data', async () => {
      sessionQb.getRawOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (dataSource.query as jest.Mock).mockResolvedValue([{ returning_users: '0' }]);

      const result = await sut.getEngagementAnalytics({});

      expect(result.avgMessagesPerSession).toBe(0);
      expect(result.avgSessionDurationMinutes).toBe(0);
      expect(result.returnUserRate).toBe(0);
      expect(result.totalUniqueUsers).toBe(0);
      expect(result.returningUsers).toBe(0);
    });

    it('applies date filters to returning users query', async () => {
      sessionQb.getRawOne
        .mockResolvedValueOnce({ avg_msg: '0' })
        .mockResolvedValueOnce({ avg_dur: '0' })
        .mockResolvedValueOnce({ total_unique: '0' });

      (dataSource.query as jest.Mock).mockResolvedValue([{ returning_users: '0' }]);

      await sut.getEngagementAnalytics({
        from: '2025-01-01',
        to: '2025-06-30',
      });

      // The raw query should include date parameters
      const queryCall = (dataSource.query as jest.Mock).mock.calls[0];
      expect(queryCall[1]).toContain('2025-01-01');
      expect(queryCall[1]).toContain('2025-06-30');
    });
  });
});
