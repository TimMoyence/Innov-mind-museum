/**
 * R1 RED — POST /api/leads/paywall-interest route (T1.6).
 *
 * Pins R1 §1 R18/R20/R22/R23/N16 down BEFORE implementation :
 *  - Route mounted on `leadsRouter` at `/api/leads/paywall-interest`.
 *  - Valid payload `{ email, consent:true, website:'' }` → 202 `{accepted:true}`,
 *    use case called exactly once.
 *  - Missing / false `consent` → 400 (R22, zod literal(true)).
 *  - Invalid email → 400.
 *  - Honeypot triggered → still 202 to the wire (R23 silent accept) AND use
 *    case still invoked so silent-drop policing happens inside the use case
 *    (mirror R3 R10 doctrine).
 *  - Rate limit — 6th request from same IP within 600s → 429 (mirror R3
 *    `betaSignupLimiter` 5 req / 600s / IP).
 *  - No CSRF requirement (N16 — unauthenticated public endpoint, mirror R3
 *    `/api/leads/beta`).
 *
 * MUST FAIL at baseline `cd7e22bc` — the route is not registered on
 * `leadsRouter` ; `submitPaywallInterestUseCase` is absent from the barrel.
 */
import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makePaywallInterestPayload } from '../../helpers/leads/paywallInterest.fixtures';

const mockSubmitBetaSignup = jest.fn();
const mockSubmitB2bLead = jest.fn();
const mockSubmitPaywallInterest = jest.fn();

jest.mock('@modules/leads/useCase', () => ({
  submitBetaSignupUseCase: {
    execute: (...args: unknown[]) => mockSubmitBetaSignup(...args),
  },
  submitB2bLeadUseCase: {
    execute: (...args: unknown[]) => mockSubmitB2bLead(...args),
  },
  // R1 §0.3 — new composition-root export in
  // `museum-backend/src/modules/leads/useCase/index.ts`.
  submitPaywallInterestUseCase: {
    execute: (...args: unknown[]) => mockSubmitPaywallInterest(...args),
  },
}));

const { app } = createRouteTestApp();

describe('Leads Routes — POST /api/leads/paywall-interest (R1 §1 R18-R23)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockSubmitPaywallInterest.mockResolvedValue(undefined);
    mockSubmitBetaSignup.mockResolvedValue(undefined);
    mockSubmitB2bLead.mockResolvedValue(undefined);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── R18 happy path ───────────────────────────────────────────────────

  it('R18: valid payload → 202 { accepted:true }, use case called once', async () => {
    const res = await request(app)
      .post('/api/leads/paywall-interest')
      .send(makePaywallInterestPayload());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(mockSubmitPaywallInterest).toHaveBeenCalledTimes(1);
  });

  it('forwards email + consent + request metadata to the use case', async () => {
    const payload = makePaywallInterestPayload({ email: 'free-tier@example.com' });
    await request(app).post('/api/leads/paywall-interest').send(payload);
    expect(mockSubmitPaywallInterest).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'free-tier@example.com',
        consent: true,
      }),
    );
  });

  // ── R22 consent validation ──────────────────────────────────────────

  it('R22: missing consent → 400', async () => {
    const full = makePaywallInterestPayload();
    const rest: Record<string, unknown> = { ...full };
    delete rest.consent;
    const res = await request(app).post('/api/leads/paywall-interest').send(rest);
    expect(res.status).toBe(400);
    expect(mockSubmitPaywallInterest).not.toHaveBeenCalled();
  });

  it('R22: consent=false → 400 (literal true required)', async () => {
    const res = await request(app)
      .post('/api/leads/paywall-interest')
      .send({ ...makePaywallInterestPayload(), consent: false });
    expect(res.status).toBe(400);
    expect(mockSubmitPaywallInterest).not.toHaveBeenCalled();
  });

  it('R22: invalid email → 400', async () => {
    const res = await request(app)
      .post('/api/leads/paywall-interest')
      .send({ ...makePaywallInterestPayload(), email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(mockSubmitPaywallInterest).not.toHaveBeenCalled();
  });

  // ── R23 honeypot silent accept ──────────────────────────────────────

  it('R23: honeypot triggered (website non-empty) → still 202 (silent accept)', async () => {
    const res = await request(app)
      .post('/api/leads/paywall-interest')
      .send(makePaywallInterestPayload({ website: 'https://spam.example.com' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    // Mirror R3 R10 doctrine — silent-drop policing inside the use case, NOT
    // at the route. The route hands the honeypot value down for logging.
    expect(mockSubmitPaywallInterest).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example.com' }),
    );
  });

  // ── Rate limit ──────────────────────────────────────────────────────

  it('returns 429 on the 6th submission from the same IP within 600s', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post('/api/leads/paywall-interest')
        .set('X-Forwarded-For', '198.51.100.42')
        .send(makePaywallInterestPayload());
      expect(ok.status).toBe(202);
    }
    const blocked = await request(app)
      .post('/api/leads/paywall-interest')
      .set('X-Forwarded-For', '198.51.100.42')
      .send(makePaywallInterestPayload());
    expect(blocked.status).toBe(429);
  });
});
