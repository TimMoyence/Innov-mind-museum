/**
 * R3 RED tests — POST /api/leads/beta route.
 *
 * Pins R3 §1 R6 + R11 + R12 + R16 + AC10 down BEFORE implementation:
 *  - `POST /api/leads/beta` exists on the `leadsRouter` mounted at `/api/leads`.
 *  - Zod schema validates `email` + `consent: literal(true)` + optional
 *    `website` honeypot string.
 *  - Happy path → 202 `{ accepted: true }`, use case called exactly once.
 *  - Missing / false `consent` → 400 (R11 defense-in-depth).
 *  - Invalid email → 400.
 *  - Honeypot triggered → still 202 to the client AND the use case is invoked
 *    so the BE can drop / log silently per R10.
 *  - 6th request from same IP within the 600s window → 429 (mirror R4 R12 —
 *    dedicated `betaSignupLimiter` with same `5 req / 600s / IP` params).
 *  - Brevo `duplicate_parameter` outcome is observable as 202 (handled inside
 *    use case, surfaced to the route as a resolved promise — R16).
 *
 * MUST FAIL at baseline `d5919dd3` — neither the `POST /beta` route nor
 * `submitBetaSignupUseCase` exists. The `jest.mock` below resolves the barrel
 * but the module itself is absent at HEAD.
 */
import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';

const mockSubmitBetaSignup = jest.fn();
const mockSubmitB2bLead = jest.fn();

// R3 §3.3 — both use cases live behind the same barrel; we mock both to avoid
// accidental Brevo wiring during this unit test.
jest.mock('@modules/leads/useCase', () => ({
  submitBetaSignupUseCase: {
    execute: (...args: unknown[]) => mockSubmitBetaSignup(...args),
  },
  submitB2bLeadUseCase: {
    execute: (...args: unknown[]) => mockSubmitB2bLead(...args),
  },
}));

const { app } = createRouteTestApp();

describe('Leads Routes — POST /api/leads/beta (R3)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockSubmitBetaSignup.mockResolvedValue(undefined);
    mockSubmitB2bLead.mockResolvedValue(undefined);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('route is mounted: a valid payload returns 202 { accepted: true } (R12)', async () => {
    const res = await request(app).post('/api/leads/beta').send(makeBetaSignupPayload());

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(mockSubmitBetaSignup).toHaveBeenCalledTimes(1);
  });

  it('forwards email + consent + request metadata to the use case (R6)', async () => {
    const payload = makeBetaSignupPayload({ email: 'someone@example.com' });
    await request(app).post('/api/leads/beta').send(payload);

    expect(mockSubmitBetaSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'someone@example.com',
        consent: true,
      }),
    );
  });

  // ── Validation ──────────────────────────────────────────────────────

  it('returns 400 when consent is missing (R11 defense-in-depth)', async () => {
    const full = makeBetaSignupPayload();
    const rest: Record<string, unknown> = { ...full };
    delete rest.consent;
    const res = await request(app).post('/api/leads/beta').send(rest);
    expect(res.status).toBe(400);
    expect(mockSubmitBetaSignup).not.toHaveBeenCalled();
  });

  it('returns 400 when consent is false (must literally be true)', async () => {
    const res = await request(app)
      .post('/api/leads/beta')
      .send({ ...makeBetaSignupPayload(), consent: false });
    expect(res.status).toBe(400);
    expect(mockSubmitBetaSignup).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/leads/beta')
      .send({ ...makeBetaSignupPayload(), email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockSubmitBetaSignup).not.toHaveBeenCalled();
  });

  // ── Honeypot ────────────────────────────────────────────────────────

  it('honeypot triggered → still 202 to the client (R10 silent accept)', async () => {
    const res = await request(app)
      .post('/api/leads/beta')
      .send(makeBetaSignupPayload({ website: 'https://spam.example.com' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    // The silent-drop policy is enforced inside the use case (R3 §3.3), not
    // at the route — so the route still calls execute() with the honeypot.
    expect(mockSubmitBetaSignup).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example.com' }),
    );
  });

  // ── Idempotent duplicate handling — R16 ─────────────────────────────

  it('use case resolved on duplicate outcome → route returns 202 (R16)', async () => {
    // Simulate the Brevo "duplicate_parameter" idempotent success path. The
    // adapter swallows the 400 + the use case resolves; the route MUST NOT
    // leak the duplicate-known signal.
    mockSubmitBetaSignup.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/leads/beta').send(makeBetaSignupPayload());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  // ── Rate limit ──────────────────────────────────────────────────────

  it('returns 429 on the 6th submission from the same IP within 600s (R12)', async () => {
    // Mirror `b2bLeadLimiter` — 5 req / 600s / IP. R3 §T2 ships a dedicated
    // `betaSignupLimiter` with the same parameters but isolated counters.
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post('/api/leads/beta')
        .set('X-Forwarded-For', '198.51.100.7')
        .send(makeBetaSignupPayload());
      expect(ok.status).toBe(202);
    }
    const blocked = await request(app)
      .post('/api/leads/beta')
      .set('X-Forwarded-For', '198.51.100.7')
      .send(makeBetaSignupPayload());
    expect(blocked.status).toBe(429);
  });
});
