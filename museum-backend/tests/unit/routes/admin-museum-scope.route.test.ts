import request from 'supertest';

import { makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const mockGetStats = jest.fn();
const mockAggregateNps = jest.fn();
const mockStreamSessions = jest.fn();
const mockAudit = jest.fn();

jest.mock('@modules/admin/useCase', () => {
  const { GetStatsUseCase } = jest.requireActual<
    typeof import('@modules/admin/useCase/analytics/getStats.useCase')
  >('@modules/admin/useCase/analytics/getStats.useCase');
  return {
    getStatsUseCase: new GetStatsUseCase({
      getStats: (...args: unknown[]) => mockGetStats(...args),
    } as never),
  };
});

jest.mock('@modules/review/useCase', () => {
  const { GetNpsUseCase } = jest.requireActual<
    typeof import('@modules/review/useCase/public/getNps.useCase')
  >('@modules/review/useCase/public/getNps.useCase');
  return {
    getNpsUseCase: new GetNpsUseCase({
      aggregateNps: (...args: unknown[]) => mockAggregateNps(...args),
    } as never),
  };
});

jest.mock('@modules/admin/useCase/export/composition', () => {
  const { ExportChatSessionsUseCase } = jest.requireActual<
    typeof import('@modules/admin/useCase/export/exportChatSessions.useCase')
  >('@modules/admin/useCase/export/exportChatSessions.useCase');
  const sessions = new ExportChatSessionsUseCase(
    { streamChatSessions: (...args: unknown[]) => mockStreamSessions(...args) } as never,
    { log: jest.fn(), logActorAction: (...args: unknown[]) => mockAudit(...args) },
    'scope-test-salt-of-at-least-32-characters',
  );
  return {
    getExportChatSessionsUseCase: () => sessions,
    getExportReviewsUseCase: jest.fn(),
    getExportTicketsUseCase: jest.fn(),
  };
});

const { app } = createRouteTestApp();

const get = (path: string, claims: Record<string, unknown>) =>
  request(app)
    .get(path)
    .set('Authorization', `Bearer ${makeToken(claims)}`);

async function* noRows(): AsyncIterable<never> {}

describe('PERIMETRE-ROUTES · the museum scope of stats, NPS and the sessions export', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockGetStats.mockResolvedValue({ totalUsers: 0 });
    mockAggregateNps.mockResolvedValue({ nps: 0, count: 0 });
    mockStreamSessions.mockImplementation(noRows);
    mockAudit.mockResolvedValue(undefined);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each([
    ['super_admin', { role: 'super_admin' }, '', []],
    ['admin asking for museum 5', { role: 'admin', museumId: 3 }, '?museumId=5', []],
    [
      'museum_manager asking for museum 99',
      { role: 'museum_manager', museumId: 7 },
      '?museumId=99',
      [7],
    ],
  ])('PERIMETRE-ROUTES · stats for %s reads %j', async (_who, claims, query, args) => {
    const res = await get(`/api/admin/stats${query}`, claims);

    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledWith(...args);
  });

  it.each([
    ['super_admin', { role: 'super_admin' }, '', undefined],
    ['admin asking for museum 5', { role: 'admin', museumId: 3 }, '?museumId=5', 5],
    [
      'museum_manager asking for museum 99',
      { role: 'museum_manager', museumId: 7 },
      '?museumId=99',
      7,
    ],
  ])('PERIMETRE-ROUTES · NPS for %s reads museum %s', async (_who, claims, query, museumId) => {
    const res = await get(`/api/admin/nps${query}`, claims);

    expect(res.status).toBe(200);
    expect(mockAggregateNps).toHaveBeenCalledWith(museumId);
  });

  it.each(['/api/admin/stats', '/api/admin/nps?museumId=5'])(
    'PERIMETRE-ROUTES · a museum_manager with no museum is refused on %s and nothing is read',
    async (path) => {
      const res = await get(path, { role: 'museum_manager' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(mockGetStats).not.toHaveBeenCalled();
      expect(mockAggregateNps).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['museum_manager', { role: 'museum_manager' }],
    ['admin', { role: 'admin' }],
  ])(
    'PERIMETRE-ROUTES · a %s with no museum cannot export sessions, nothing is read nor audited',
    async (_who, claims) => {
      const res = await get('/api/admin/export/sessions.csv', claims);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'No museum assigned' });
      expect(mockStreamSessions).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['super_admin', { role: 'super_admin' }, null],
    ['admin of museum 3', { role: 'admin', museumId: 3 }, 3],
    ['museum_manager of museum 7', { role: 'museum_manager', museumId: 7 }, 7],
  ])('PERIMETRE-ROUTES · %s exports the sessions of scope %s', async (_who, claims, scope) => {
    const res = await get('/api/admin/export/sessions.csv', claims);

    expect(res.status).toBe(200);
    expect(mockStreamSessions).toHaveBeenCalledWith({ scopeMuseumId: scope });
  });
});
