/**
 * Targeted mutation kills for `admin-analytics-queries.ts` — written
 * 2026-05-15 to chip into the 65 first-pass survivors documented in the
 * 2026-05-15 night recap (commit f90026b0).
 *
 * Strategy: the existing analytics-usecases.test.ts mocks the IAdminRepository
 * facade and never reaches the QueryBuilder string-construction layer. The
 * StringLiteral / ConditionalExpression / ArithmeticOperator / BlockStatement
 * mutants on `.createQueryBuilder(alias)`, `.select(expr, alias)`,
 * `.addSelect`, `.where`, `.orderBy`, `.groupBy`, the `if (filters.from)`
 * conditionals, and the cutoff date computation all survive because no test
 * asserts on the qb call args.
 *
 * This file calls the 3 exported query functions directly with a spy-based
 * mock of `AnalyticsRepositories` and asserts the exact arg strings on every
 * fluent qb method.
 *
 * Strict assertions only. No production-code changes.
 */
import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

import {
  queryContentAnalytics,
  queryEngagementAnalytics,
  queryUsageAnalytics,
} from '@modules/admin/adapters/secondary/pg/admin-analytics-queries';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { AuditLog } from '@shared/audit/auditLog.entity';
import type { DataSource, Repository } from 'typeorm';

interface AnalyticsRepositoriesShape {
  dataSource: DataSource;
  sessionRepo: Repository<ChatSession>;
  messageRepo: Repository<ChatMessage>;
  auditRepo: Repository<AuditLog>;
}

interface TestHarness {
  repos: AnalyticsRepositoriesShape;
  qb: ReturnType<typeof makeMockQb>;
  sessionCreate: jest.Mock;
  messageCreate: jest.Mock;
  auditCreate: jest.Mock;
  artworkCreate: jest.Mock;
  dataSourceQuery: jest.Mock;
}

/**
 * Build a fully mocked `AnalyticsRepositories` bundle. The same `qb` instance
 * is returned by every `createQueryBuilder()` call so a single set of
 * assertions can cover every chained method invocation across the 3 query
 * functions. `dataSource.getRepository(ArtworkMatch)` returns its own
 * `createQueryBuilder` mock so the alias for the artworks query (`'a'`) can
 * be asserted independently of the session/message/audit aliases.
 */
function buildHarness(): TestHarness {
  const qb = makeMockQb();
  // The .from() builder callback in queryEngagementAnalytics is invoked with
  // a subquery builder — point clone/from at qb so the callback can build its
  // sub-query against the same spy and we can assert on the subquery args
  // too (s.id / msg_count / leftJoin alias).
  qb.from.mockImplementation((arg: unknown) => {
    // `.from` accepts (1) an entity class — `ChatSession` etc, which is also
    // `typeof === 'function'`, (2) a subquery callback `(qb) => qb.select(...)`,
    // or (3) a string. Only the callback path should be invoked here so the
    // inner .select / .addSelect / .leftJoin / .groupBy chain runs against qb
    // and gets recorded for assertions. Distinguish via `.prototype` — classes
    // have one, arrow functions don't.
    if (typeof arg === 'function' && !(arg as { prototype?: unknown }).prototype) {
      (arg as (sub: typeof qb) => unknown)(qb);
    }
    return qb;
  });

  const sessionCreate = jest.fn(() => qb);
  const messageCreate = jest.fn(() => qb);
  const auditCreate = jest.fn(() => qb);
  const artworkCreate = jest.fn(() => qb);

  const sessionRepo = { createQueryBuilder: sessionCreate } as unknown as Repository<ChatSession>;
  const messageRepo = { createQueryBuilder: messageCreate } as unknown as Repository<ChatMessage>;
  const auditRepo = { createQueryBuilder: auditCreate } as unknown as Repository<AuditLog>;
  const artworkRepo = { createQueryBuilder: artworkCreate };

  const dataSourceQuery = jest.fn().mockResolvedValue([{ returning_users: '0' }]);
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ArtworkMatch) return artworkRepo;
      if (entity === ChatSession) return sessionRepo;
      if (entity === ChatMessage) return messageRepo;
      return artworkRepo;
    }),
    query: dataSourceQuery,
  } as unknown as DataSource;

  const repos: AnalyticsRepositoriesShape = {
    dataSource,
    sessionRepo,
    messageRepo,
    auditRepo,
  };

  return { repos, qb, sessionCreate, messageCreate, auditCreate, artworkCreate, dataSourceQuery };
}

describe('admin-analytics-queries — mutation kills', () => {
  // ──────────────────────────────────────────────────────────────────────
  // queryUsageAnalytics — covers granularity switch (L28-32), cutoff date
  // arithmetic (L61), filter conditionals (L67/L70/L74), and 3 separate
  // createQueryBuilder fluent chains (sessions / messages / activeUsers).
  // ──────────────────────────────────────────────────────────────────────

  describe('queryUsageAnalytics', () => {
    describe('granularityToTrunc switch (L28-32 StringLiteral kills)', () => {
      it('emits date_trunc(\'day\', …) when granularity is "daily" (kills `return "day"` → "")', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { granularity: 'daily', days: 30 });

        const dayMatch = qb.select.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes(`date_trunc('day',`),
        );
        expect(dayMatch).toBeDefined();
      });

      it('emits date_trunc(\'week\', …) when granularity is "weekly" (kills `case "weekly"` → "")', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { granularity: 'weekly', days: 30 });

        const weekMatch = qb.select.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes(`date_trunc('week',`),
        );
        expect(weekMatch).toBeDefined();
      });

      it('emits date_trunc(\'month\', …) when granularity is "monthly" (kills `case "monthly"` → "")', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { granularity: 'monthly', days: 30 });

        const monthMatch = qb.select.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes(`date_trunc('month',`),
        );
        expect(monthMatch).toBeDefined();
      });
    });

    describe('cutoff date arithmetic (L61 ArithmeticOperator kill)', () => {
      it('computes cutoff in the PAST (kills - → + on `Date.now() - days * 86_400_000`)', async () => {
        const { repos, qb } = buildHarness();
        const before = Date.now();
        await queryUsageAnalytics(repos as never, { days: 30 });

        // First `qb.where` call carries `{ cutoff: ISO string }` (no filters.from).
        const whereCalls = qb.where.mock.calls;
        const cutoffCall = whereCalls.find(
          (c) => typeof c[1] === 'object' && c[1] !== null && 'cutoff' in (c[1] as object),
        );
        expect(cutoffCall).toBeDefined();
        const cutoffIso = (cutoffCall![1] as { cutoff: string }).cutoff;
        const cutoffMs = Date.parse(cutoffIso);

        // Past, not future — kills the `+` mutant which would put cutoff in the future.
        expect(cutoffMs).toBeLessThan(before);
        // Roughly 30 days before now (allow 1 hour slack for test scheduling).
        const thirtyDaysMs = 30 * 86_400_000;
        expect(before - cutoffMs).toBeGreaterThan(thirtyDaysMs - 3_600_000);
        expect(before - cutoffMs).toBeLessThan(thirtyDaysMs + 3_600_000);
      });

      it('returns a `from` field consistent with the cutoff (kills L126 - → / ArithmeticOperator)', async () => {
        const { repos } = buildHarness();
        const result = await queryUsageAnalytics(repos as never, { days: 30 });

        // result.period.from is computed via the same `Date.now() - days * 86400000`
        // but with `.slice(0, 10)` — kills the `- days / 86400000` mutant which
        // would return today's date (the divide collapses to a tiny number).
        const fromMs = Date.parse(`${result.period.from}T00:00:00Z`);
        const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
        expect(fromMs).toBeLessThan(todayMs);
      });

      it('result.period.to slice(0,10) yields YYYY-MM-DD (kills MethodExpression slice removal at L127)', async () => {
        const { repos } = buildHarness();
        const result = await queryUsageAnalytics(repos as never, { days: 30 });

        // L127 MethodExpression: `.toISOString().slice(0, 10)` → `.toISOString()`
        // Mutant would return a full ISO string with the time portion; original
        // truncates to YYYY-MM-DD.
        expect(result.period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.period.to.length).toBe(10);
      });
    });

    describe('filter conditionals (L67/L70/L74 BlockStatement + ConditionalExpression kills)', () => {
      it('uses :from in the SQL when filters.from is provided (kills if → false)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { from: '2026-01-01', days: 30 });

        const fromCall = qb.where.mock.calls.find(
          (c) => typeof c[1] === 'object' && c[1] !== null && 'from' in (c[1] as object),
        );
        expect(fromCall).toBeDefined();
        // Asserts the condition string contains ':from' — kills the
        // `conditions.push("")` StringLiteral mutant on L68.
        expect(fromCall![0]).toContain(':from');
      });

      it('uses :cutoff (not :from) when filters.from is absent (kills if → true on L67 + BlockStatement → {} on L70)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { days: 30 });

        const cutoffCall = qb.where.mock.calls.find(
          (c) => typeof c[1] === 'object' && c[1] !== null && 'cutoff' in (c[1] as object),
        );
        expect(cutoffCall).toBeDefined();
        expect(cutoffCall![0]).toContain(':cutoff');
        // And NOT :from
        expect(cutoffCall![0]).not.toContain(':from');
      });

      it('appends :to condition when filters.to is provided (kills BlockStatement → {} on L75)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, {
          from: '2026-01-01',
          to: '2026-01-31',
          days: 30,
        });

        const withToCall = qb.where.mock.calls.find(
          (c) =>
            typeof c[1] === 'object' &&
            c[1] !== null &&
            'to' in (c[1] as object) &&
            'from' in (c[1] as object),
        );
        expect(withToCall).toBeDefined();
        expect(withToCall![0]).toContain(':to');
        expect(withToCall![0]).toContain(':from');
        // The two clauses are AND-joined — kills `.join("")` StringLiteral
        // mutant on L93 / L101 / L110.
        expect(withToCall![0]).toMatch(/ AND /);
      });
    });

    describe('createQueryBuilder aliases (L89/L98/L106 StringLiteral kills)', () => {
      it('builds the sessions chain with alias "session" (kills createQueryBuilder("") on L89)', async () => {
        const harness = buildHarness();
        await queryUsageAnalytics(harness.repos as never, { days: 30 });

        // sessionsResult + activeUsersResult both use sessionRepo with alias 'session'.
        expect(harness.sessionCreate).toHaveBeenCalledWith('session');
        expect(harness.sessionCreate.mock.calls.every((c) => c[0] === 'session')).toBe(true);
      });

      it('builds the messages chain with alias "message" (kills createQueryBuilder("") on L98)', async () => {
        const harness = buildHarness();
        await queryUsageAnalytics(harness.repos as never, { days: 30 });

        expect(harness.messageCreate).toHaveBeenCalledWith('message');
      });
    });

    describe('qb method args — exact string kills', () => {
      it('addSelect emits "COUNT(*)" with alias "c" on sessions + messages (kills addSelect("") and addSelect("COUNT(*)", "") mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { days: 30 });

        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(*)', 'c');
      });

      it('addSelect emits the distinct-users expression on activeUsers query (kills addSelect("", "c") + addSelect(distinct, "") on L108)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { days: 30 });

        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT session."userId")', 'c');
      });

      it('groupBy and orderBy both target alias "d" on each query (kills groupBy/orderBy("") mutants on L94/L95/L102/L103/L113/L114)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { days: 30 });

        expect(qb.groupBy).toHaveBeenCalledWith('d');
        expect(qb.orderBy).toHaveBeenCalledWith('d');
      });

      it('activeUsers where appends \' AND session."userId" IS NOT NULL\' (kills StringLiteral mutant on L110)', async () => {
        const { repos, qb } = buildHarness();
        await queryUsageAnalytics(repos as never, { days: 30 });

        const activeUsersWhere = qb.where.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('session."userId" IS NOT NULL'),
        );
        expect(activeUsersWhere).toBeDefined();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // queryContentAnalytics — topArtworks via getRepository(ArtworkMatch),
  // topMuseums via sessionRepo, guardrailBlockRate via auditRepo (2 qbs).
  // ──────────────────────────────────────────────────────────────────────

  describe('queryContentAnalytics', () => {
    describe('topN nullish-coalescing default (L141 LogicalOperator kill)', () => {
      it('uses default 10 when filters.limit is undefined (kills ?? → && on L141)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        // Mutant `?? 10` → `&& 10` returns `undefined` for falsy limit → qb.limit(undefined).
        // Original returns 10. Asserting toHaveBeenCalledWith(10) kills the mutant.
        expect(qb.limit).toHaveBeenCalledWith(10);
      });

      it('honors a custom limit when provided', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, { limit: 5 });

        expect(qb.limit).toHaveBeenCalledWith(5);
      });
    });

    describe('createQueryBuilder aliases (L146/L163/L188 StringLiteral kills)', () => {
      it('artwork chain uses alias "a" (kills createQueryBuilder("") on L146)', async () => {
        const harness = buildHarness();
        await queryContentAnalytics(harness.repos as never, {});

        expect(harness.artworkCreate).toHaveBeenCalledWith('a');
      });

      it('museum chain uses alias "session" (kills createQueryBuilder("") on L163)', async () => {
        const harness = buildHarness();
        await queryContentAnalytics(harness.repos as never, {});

        expect(harness.sessionCreate).toHaveBeenCalledWith('session');
      });

      it('audit chains use alias "log" twice (kills createQueryBuilder("") on L179/L188)', async () => {
        const harness = buildHarness();
        await queryContentAnalytics(harness.repos as never, {});

        // Both totalQb and blockedQb use the audit repo with alias 'log'.
        expect(harness.auditCreate).toHaveBeenCalledWith('log');
        expect(harness.auditCreate.mock.calls.every((c) => c[0] === 'log')).toBe(true);
        expect(harness.auditCreate).toHaveBeenCalledTimes(2);
      });
    });

    describe('qb chain args — exact string kills', () => {
      it('artwork chain selects title + artist + COUNT(*) with their exact aliases (kills 5 StringLiteral mutants on L147/L148/L149)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith('a.title', 'title');
        expect(qb.addSelect).toHaveBeenCalledWith('a.artist', 'artist');
        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(*)', 'c');
      });

      it('artwork chain groupBy + addGroupBy + orderBy use exact column references (kills L150/L151/L152 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.groupBy).toHaveBeenCalledWith('a.title');
        expect(qb.addGroupBy).toHaveBeenCalledWith('a.artist');
        expect(qb.orderBy).toHaveBeenCalledWith('c', 'DESC');
      });

      it('museum chain selects session.museumName + COUNT(*) with exact aliases (kills L164/L165 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith('session.museumName', 'name');
      });

      it('museum chain WHERE filters out NULL museumName (kills L166 NULL-filter StringLiteral mutant)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.where).toHaveBeenCalledWith('session.museumName IS NOT NULL');
      });

      it('guardrail blocked-query WHERE pins exact action literal (kills L190 StringLiteral mutant)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.where).toHaveBeenCalledWith("log.action = 'SECURITY_GUARDRAIL_BLOCK'");
      });

      it('guardrail counts both total and blocked with COUNT(*) and alias "total" (kills L179/L189 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith('COUNT(*)', 'total');
      });
    });

    describe('filters.from/to conditional kills on artwork + museum + audit chains', () => {
      it('artwork chain calls andWhere on filters.from (kills ConditionalExpression → true on L155)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, { from: '2026-01-01' });

        const fromCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0] === 'a.createdAt >= :from',
        );
        expect(fromCall).toBeDefined();
        expect(fromCall![1]).toEqual({ from: '2026-01-01' });
      });

      it('artwork chain does NOT call andWhere with :from when filters.from is absent (kills if → true)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, {});

        const fromCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('a.createdAt >= :from'),
        );
        expect(fromCall).toBeUndefined();
      });

      it('audit chains apply filters.to when provided (kills if(false) on L194)', async () => {
        const { repos, qb } = buildHarness();
        await queryContentAnalytics(repos as never, { to: '2026-12-31' });

        const toCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0] === 'log.createdAt <= :to',
        );
        expect(toCall).toBeDefined();
        expect(toCall![1]).toEqual({ to: '2026-12-31' });
      });
    });

    describe('guardrailBlockRate computation', () => {
      it('returns 0 when total = 0 (kills `total > 0 ? blocked / total : 0` ConditionalExpression', async () => {
        const { repos, qb } = buildHarness();
        qb.getRawOne.mockResolvedValue({ total: '0' });
        qb.getRawMany.mockResolvedValue([]);

        const result = await queryContentAnalytics(repos as never, {});
        expect(result.guardrailBlockRate).toBe(0);
      });

      it('returns blocked/total ratio when total > 0', async () => {
        const { repos, qb } = buildHarness();
        // First getRawOne (total) then second getRawOne (blocked).
        qb.getRawOne.mockResolvedValueOnce({ total: '100' }).mockResolvedValueOnce({ total: '5' });
        qb.getRawMany.mockResolvedValue([]);

        const result = await queryContentAnalytics(repos as never, {});
        expect(result.guardrailBlockRate).toBeCloseTo(0.05, 5);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // queryEngagementAnalytics — 3 sessionRepo qbs + raw dataSource.query.
  // ──────────────────────────────────────────────────────────────────────

  describe('queryEngagementAnalytics', () => {
    describe('createQueryBuilder aliases (StringLiteral kills L248/L267/L277)', () => {
      it('all three sessionRepo qbs use alias "s" (kills createQueryBuilder("") on L248/L267/L277)', async () => {
        const harness = buildHarness();
        await queryEngagementAnalytics(harness.repos as never, {});

        expect(harness.sessionCreate).toHaveBeenCalledWith('s');
        expect(harness.sessionCreate.mock.calls.every((c) => c[0] === 's')).toBe(true);
        // 3 calls total: avgMsgQb, avgDurationQb, returnRateMainQb.
        expect(harness.sessionCreate).toHaveBeenCalledTimes(3);
      });
    });

    describe('qb chain args — exact string kills', () => {
      it('avgMsgQb selects COALESCE(AVG, 0) with alias "avg_msg" (kills L249 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith('COALESCE(AVG(sub.msg_count), 0)', 'avg_msg');
      });

      it('avgDurationQb selects the EXTRACT(EPOCH) expression with alias "avg_dur" (kills L270/L271 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith(
          'COALESCE(AVG(EXTRACT(EPOCH FROM (s."updatedAt" - s."createdAt")) / 60), 0)',
          'avg_dur',
        );
      });

      it('returnRateMainQb selects DISTINCT userId with alias "total_unique" and filters NULL userId (kills L278/L279)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, {});

        expect(qb.select).toHaveBeenCalledWith('COUNT(DISTINCT s."userId")', 'total_unique');
        expect(qb.where).toHaveBeenCalledWith('s."userId" IS NOT NULL');
      });

      it('subquery select chain pins exact column refs (kills L252/L253/L255 StringLiteral mutants)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, {});

        // Subquery built via .from(callback) — callback invokes select/addSelect/etc.
        expect(qb.select).toHaveBeenCalledWith('s.id', 'id');
        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(m.id)', 'msg_count');
        expect(qb.leftJoin).toHaveBeenCalledWith(ChatMessage, 'm', 'm."sessionId" = s.id');
        expect(qb.groupBy).toHaveBeenCalledWith('s.id');
      });
    });

    describe('addDateFilters helper conditional kills (L233/L236)', () => {
      it('appends :from condition with the supplied filters.from (kills L233 if → false + L234 StringLiteral)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, { from: '2026-02-01' });

        const fromCall = qb.andWhere.mock.calls.find(
          (c) =>
            typeof c[0] === 'string' &&
            (c[0] === 's."createdAt" >= :from' || c[0] === 's."createdAt" >= :from'),
        );
        expect(fromCall).toBeDefined();
        expect(fromCall![1]).toEqual({ from: '2026-02-01' });
      });

      it('appends :to condition when filters.to is provided (kills L236 + L237 ObjectLiteral → {})', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, { to: '2026-02-28' });

        const toCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0] === 's."createdAt" <= :to',
        );
        expect(toCall).toBeDefined();
        // ObjectLiteral mutant on L237 produces `{}` — kills by asserting the
        // exact key/value pair survives.
        expect(toCall![1]).toEqual({ to: '2026-02-28' });
      });

      it('does NOT call andWhere with date conditions when neither filter is set (kills if → true)', async () => {
        const { repos, qb } = buildHarness();
        await queryEngagementAnalytics(repos as never, {});

        const fromCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes(':from'),
        );
        const toCall = qb.andWhere.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes(':to'),
        );
        expect(fromCall).toBeUndefined();
        expect(toCall).toBeUndefined();
      });
    });

    describe('returningUsers raw SQL construction (L283-291)', () => {
      it('returningParams starts empty and stays empty when neither filter is set (kills ArrayDeclaration L283 sentinel injection)', async () => {
        const harness = buildHarness();
        await queryEngagementAnalytics(harness.repos as never, {});

        // dataSource.query is called with (sql, params). With no filters, params = [].
        const queryCall = harness.dataSourceQuery.mock.calls[0];
        expect(queryCall).toBeDefined();
        expect(queryCall[1]).toEqual([]);
      });

      it('returningParams contains [from] when filters.from is set (kills L285 if → false)', async () => {
        const harness = buildHarness();
        await queryEngagementAnalytics(harness.repos as never, { from: '2026-02-01' });

        const queryCall = harness.dataSourceQuery.mock.calls[0];
        expect(queryCall[1]).toEqual(['2026-02-01']);
        // SQL fragment must include the AND clause for from.
        expect(queryCall[0]).toContain('sub."createdAt" >= $1');
      });

      it('returningParams contains [from, to] in order when both are set (kills L289 if → false + L287 string fragment mutants)', async () => {
        const harness = buildHarness();
        await queryEngagementAnalytics(harness.repos as never, {
          from: '2026-02-01',
          to: '2026-02-28',
        });

        const queryCall = harness.dataSourceQuery.mock.calls[0];
        expect(queryCall[1]).toEqual(['2026-02-01', '2026-02-28']);
        // Position-numbered placeholders survive — kills the empty-string mutants
        // on L287/L291 which would produce an unfiltered subquery.
        expect(queryCall[0]).toContain('sub."createdAt" >= $1');
        expect(queryCall[0]).toContain('sub."createdAt" <= $2');
      });
    });

    describe('result aggregation edge cases', () => {
      it('returns returnUserRate = 0 when totalUniqueUsers = 0 (kills `totalUniqueUsers > 0 ? returningUsers / totalUniqueUsers : 0` mutants)', async () => {
        const { repos, qb, dataSourceQuery } = buildHarness();
        qb.getRawOne
          .mockResolvedValueOnce({ avg_msg: '4.5' })
          .mockResolvedValueOnce({ avg_dur: '12' })
          .mockResolvedValueOnce({ total_unique: '0' });
        dataSourceQuery.mockResolvedValue([{ returning_users: '0' }]);

        const result = await queryEngagementAnalytics(repos as never, {});
        expect(result.returnUserRate).toBe(0);
        expect(result.totalUniqueUsers).toBe(0);
      });

      it('parses numeric strings via parseInt/parseFloat and falls back to 0 on undefined (kills OptionalChaining L310/L311 + parseFloat fallback)', async () => {
        const { repos, qb, dataSourceQuery } = buildHarness();
        qb.getRawOne
          .mockResolvedValueOnce(null) // avg_msg
          .mockResolvedValueOnce(null) // avg_dur
          .mockResolvedValueOnce(null); // total_unique
        dataSourceQuery.mockResolvedValue([]);

        const result = await queryEngagementAnalytics(repos as never, {});
        // All fall back to 0 — kills OptionalChaining removal (would throw on null.total_unique).
        expect(result.avgMessagesPerSession).toBe(0);
        expect(result.avgSessionDurationMinutes).toBe(0);
        expect(result.totalUniqueUsers).toBe(0);
        expect(result.returningUsers).toBe(0);
      });

      it('computes returnUserRate as returningUsers / totalUniqueUsers when total > 0', async () => {
        const { repos, qb, dataSourceQuery } = buildHarness();
        qb.getRawOne
          .mockResolvedValueOnce({ avg_msg: '0' })
          .mockResolvedValueOnce({ avg_dur: '0' })
          .mockResolvedValueOnce({ total_unique: '200' });
        dataSourceQuery.mockResolvedValue([{ returning_users: '70' }]);

        const result = await queryEngagementAnalytics(repos as never, {});
        expect(result.totalUniqueUsers).toBe(200);
        expect(result.returningUsers).toBe(70);
        expect(result.returnUserRate).toBeCloseTo(0.35, 5);
      });
    });
  });
});
