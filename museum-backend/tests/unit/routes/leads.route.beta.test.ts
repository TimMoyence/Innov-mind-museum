import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makeBetaSignupPayload } from '../../helpers/leads/betaSignup.fixtures';

const mockSubmitBetaSignup = jest.fn();
const mockSubmitB2bLead = jest.fn();

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

  it('honeypot triggered → still 202 to the client (R10 silent accept)', async () => {
    const res = await request(app)
      .post('/api/leads/beta')
      .send(makeBetaSignupPayload({ website: 'https://spam.example.com' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(mockSubmitBetaSignup).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example.com' }),
    );
  });

  it('use case resolved on duplicate outcome → route returns 202 (R16)', async () => {
    mockSubmitBetaSignup.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/leads/beta').send(makeBetaSignupPayload());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  it('returns 429 on the 6th submission from the same IP within 600s (R12)', async () => {
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
