/**
 * T-B5 (RED — Wave B / C8 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the museumId scope + BOLA (OWASP API3) guard for admin analytics
 * routes :
 *
 *   GET /api/admin/stats?museumId=<id>
 *
 * Acceptance (spec R-C8 + tasks.md T-B5) :
 *   (a) museum_manager(museumId=42) calling GET /admin/stats?museumId=42
 *       → 200 + scoped response (use case called with { museumId: 42 }).
 *   (b) museum_manager(museumId=42) calling GET /admin/stats?museumId=99
 *       → 403 OR scope force-rewritten to 42 (BOLA — caller MUST NOT
 *       observe museum 99's data). OWASP API3 (Broken Object Level Auth).
 *   (c) super_admin without museumId param → 200 + cross-tenant view
 *       (use case called with no museumId, or museumId=undefined).
 *   (d) `museumId` extra param goes through z.strictObject → 400 when an
 *       extra param like `foo=bar` is sent (strictObject rejects unknown
 *       keys).
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C8 +
 * `design.md` §3 Vague B C8 (D6: z.strictObject + RBAC scope:
 * super_admin global, museum_manager forced tenant) + `tasks.md` T-B5.
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   - `admin.route.ts:229-237` : GET /stats has NO query schema, no Zod
 *     validation, no museumId binding → use case called with `()`.
 *   - `getStatsUseCase.execute()` (`getStats.useCase.ts:7-9`) takes
 *     NOTHING — there is no place to thread museumId through.
 *   - `requireRole('admin','moderator')` allows museum_manager only via
 *     super_admin implicit escalation; museum_manager itself is BLOCKED
 *     at the requireRole gate (museum_manager is NOT in the list).
 *
 * Expected red failure modes (any one suffices) :
 *   - (a) the test signals the route did not parse `museumId` (mock
 *     use case was never called with `{ museumId: 42 }`).
 *   - (b) the test signals BOLA: museum_manager(42) calling ?museumId=99
 *     received 200 with cross-tenant data (museum_manager is 403'd
 *     entirely today → still failing because the test expects either 403
 *     OR forced-scope, but the route blocks museum_manager at requireRole
 *     before reaching either code path → the BOLA negative assertion
 *     "use case was NOT called with { museumId: 99 }" still passes, but
 *     the positive scope assertion in (a) and (c) fail).
 *   - (d) the test signals `?foo=bar` returns 200 instead of 400.
 *
 * Pattern : mirrors `tests/unit/admin/admin-schemas.test.ts` (createRouteTestApp
 * + supertest + mock use cases via jest.mock('@modules/admin/useCase', ...)).
 * Lives under `tests/integration/admin/` (not `tests/unit/`) per the brief —
 * the contract spans router + Zod + RBAC + use case invocation shape, which is
 * a multi-layer integration even without Postgres.
 *
 * No factories used — JWT tokens come from `tests/helpers/auth/token.helpers`
 * (`makeToken` with role + claim overrides). No inline entity creation.
 */
import request from 'supertest';

import { makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

// ── Mock admin use cases — same pattern as `tests/unit/admin/admin-schemas.test.ts`.
// `mockGetStats` MUST be defined before the jest.mock() factory captures it.

const mockGetStats = jest.fn();
const mockListUsers = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockChangeUserRole = jest.fn().mockResolvedValue({ id: 1 });
const mockListAuditLogs = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockListReports = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockResolveReport = jest.fn().mockResolvedValue({ id: 'r1' });
const mockGetUsageAnalytics = jest.fn().mockResolvedValue({});
const mockGetContentAnalytics = jest.fn().mockResolvedValue({});
const mockGetEngagementAnalytics = jest.fn().mockResolvedValue({});
const mockListTickets = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockUpdateTicket = jest.fn().mockResolvedValue({ id: 't1' });
const mockListReviews = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockModerateReview = jest.fn().mockResolvedValue({ id: 'rv1' });
const mockGetUserById = jest.fn().mockResolvedValue({ id: 1 });
const mockChangeUserTier = jest.fn().mockResolvedValue({ id: 1 });
const mockSuspendUser = jest.fn().mockResolvedValue({ id: 1 });
const mockUnsuspendUser = jest.fn().mockResolvedValue({ id: 1 });
const mockDeleteUser = jest.fn().mockResolvedValue({ id: 1 });

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: (...a: unknown[]) => mockListUsers(...a) },
  getUserByIdUseCase: { execute: (...a: unknown[]) => mockGetUserById(...a) },
  changeUserRoleUseCase: { execute: (...a: unknown[]) => mockChangeUserRole(...a) },
  changeUserTierUseCase: { execute: (...a: unknown[]) => mockChangeUserTier(...a) },
  suspendUserUseCase: { execute: (...a: unknown[]) => mockSuspendUser(...a) },
  unsuspendUserUseCase: { execute: (...a: unknown[]) => mockUnsuspendUser(...a) },
  deleteUserUseCase: { execute: (...a: unknown[]) => mockDeleteUser(...a) },
  listAuditLogsUseCase: { execute: (...a: unknown[]) => mockListAuditLogs(...a) },
  getStatsUseCase: { execute: (...a: unknown[]) => mockGetStats(...a) },
  listReportsUseCase: { execute: (...a: unknown[]) => mockListReports(...a) },
  resolveReportUseCase: { execute: (...a: unknown[]) => mockResolveReport(...a) },
  getUsageAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetUsageAnalytics(...a) },
  getContentAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetContentAnalytics(...a) },
  getEngagementAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetEngagementAnalytics(...a) },
  adminReviewFacade: {
    list: (...a: unknown[]) => mockListReviews(...a),
    moderateReview: (...a: unknown[]) => mockModerateReview(...a),
  },
  adminSupportFacade: {
    list: (...a: unknown[]) => mockListTickets(...a),
    update: (...a: unknown[]) => mockUpdateTicket(...a),
  },
}));

const { app } = createRouteTestApp();

const bearerSuperAdmin = (): string => `Bearer ${makeToken({ role: 'super_admin' })}`;
// museum_manager tokens carry the tenant claim — green resolves the JWT
// claim into the use-case `museumId` scope (D6). Today the JWT shape has
// no `museumId` claim baked in, so this property names what green must add.
const bearerMuseumManager = (museumId: number): string =>
  `Bearer ${makeToken({ role: 'museum_manager', museumId })}`;

beforeEach(() => {
  resetRateLimits();
  jest.clearAllMocks();
  mockGetStats.mockResolvedValue({ totalUsers: 0, totalReviews: 0 });
});

afterAll(() => {
  stopRateLimitSweep();
});

describe('GET /api/admin/stats — museumId scope + BOLA guard (T-B5 — R-C8 / OWASP API3)', () => {
  it('(a) museum_manager(42) ?museumId=42 → 200 + use case called with { museumId: 42 }', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=42')
      .set('Authorization', bearerMuseumManager(42));

    // FAIL at baseline (any of these):
    //  - 403 (requireRole list excludes museum_manager, today gate at
    //    admin.route.ts:232).
    //  - 200 but use case called with `()` (no museumId threaded).
    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetStats).toHaveBeenCalledWith(expect.objectContaining({ museumId: 42 }));
  });

  it('(b) museum_manager(42) ?museumId=99 → 403 OR forced-scope (BOLA — no cross-tenant read)', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=99')
      .set('Authorization', bearerMuseumManager(42));

    // Two acceptable green branches per D6:
    //  (i) reject outright with 403 (preferred — explicit BOLA signal).
    //  (ii) accept 200 but force-rewrite museumId back to the caller's
    //       tenant (42) before the use-case call.
    // FAIL at baseline: route does not parse museumId AND does not bind
    // the JWT museumId claim → either 403 (current museum_manager block
    // by requireRole, which technically satisfies BOLA but not (a)/(c))
    // OR 200 + use case called with `()` (no museumId), which leaves
    // tenant intent ambiguous.
    const got403 = res.status === 403;
    const got200WithForcedScope =
      res.status === 200 &&
      mockGetStats.mock.calls.some(
        (call) => (call[0] as { museumId?: number } | undefined)?.museumId === 42,
      );
    expect(got403 || got200WithForcedScope).toBe(true);

    // BOLA negative guard — regardless of branch, the use case MUST NOT
    // be invoked with `{ museumId: 99 }` for this caller.
    const calledWithCrossTenant = mockGetStats.mock.calls.some(
      (call) => (call[0] as { museumId?: number } | undefined)?.museumId === 99,
    );
    expect(calledWithCrossTenant).toBe(false);
  });

  it('(c) super_admin without museumId → 200 + cross-tenant view (use case called with no museumId)', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', bearerSuperAdmin());

    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    // No museumId in the call args → cross-tenant aggregate.
    const firstArg = mockGetStats.mock.calls[0]?.[0] as { museumId?: number } | undefined;
    // Accept either undefined args (current `execute()`) OR an object with
    // museumId undefined — both shapes mean "no scope filter".
    const noMuseumId = firstArg === undefined || firstArg.museumId === undefined;
    expect(noMuseumId).toBe(true);
  });

  it('(d) z.strictObject rejects unknown query params (e.g. ?museumId=42&foo=bar → 400)', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=42&foo=bar')
      .set('Authorization', bearerSuperAdmin());

    // FAIL at baseline: route has NO Zod validation on /stats, so any
    // query param goes through unchecked → 200.
    expect(res.status).toBe(400);
  });
});
