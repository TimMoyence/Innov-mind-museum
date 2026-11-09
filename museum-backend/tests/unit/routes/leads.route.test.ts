import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';

const mockSubmitB2bLead = jest.fn();

jest.mock('@modules/leads/useCase', () => ({
  submitB2bLeadUseCase: {
    execute: (...args: unknown[]) => mockSubmitB2bLead(...args),
  },
}));

const { app } = createRouteTestApp();

describe('Leads Routes — POST /api/leads/b2b (R4)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockSubmitB2bLead.mockResolvedValue(undefined);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('route is mounted: a valid payload returns 202 { accepted: true } (R12)', async () => {
    const res = await request(app).post('/api/leads/b2b').send(makeB2bLeadPayload());

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(mockSubmitB2bLead).toHaveBeenCalledTimes(1);
  });

  it('forwards every field + request metadata to the use case (R13)', async () => {
    const payload = makeB2bLeadPayload({ museum: 'Centre Pompidou' });
    await request(app).post('/api/leads/b2b').send(payload);

    expect(mockSubmitB2bLead).toHaveBeenCalledWith(
      expect.objectContaining({
        email: payload.email,
        name: payload.name,
        museum: 'Centre Pompidou',
        role: 'director',
        message: payload.message,
        consent: true,
      }),
    );
  });

  it('returns 400 when consent is missing (R11 defense-in-depth)', async () => {
    const full = makeB2bLeadPayload();
    const rest: Record<string, unknown> = { ...full };
    delete rest.consent;
    const res = await request(app).post('/api/leads/b2b').send(rest);
    expect(res.status).toBe(400);
    expect(mockSubmitB2bLead).not.toHaveBeenCalled();
  });

  it('returns 400 when consent is false (must literally be true)', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), consent: false });
    expect(res.status).toBe(400);
    expect(mockSubmitB2bLead).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for role outside enum', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), role: 'ceo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for message shorter than 10 chars', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), message: 'too short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for museum longer than 200 chars', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send({ ...makeB2bLeadPayload(), museum: 'm'.repeat(201) });
    expect(res.status).toBe(400);
  });

  it('honeypot triggered → still 202 to the client (R10 silent accept)', async () => {
    const res = await request(app)
      .post('/api/leads/b2b')
      .send(makeB2bLeadPayload({ website: 'https://spam.example.com' }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(mockSubmitB2bLead).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://spam.example.com' }),
    );
  });

  it('returns 429 on the 6th submission from the same IP within 600s (R12)', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post('/api/leads/b2b')
        .set('X-Forwarded-For', '203.0.113.7')
        .send(makeB2bLeadPayload());
      expect(ok.status).toBe(202);
    }
    const blocked = await request(app)
      .post('/api/leads/b2b')
      .set('X-Forwarded-For', '203.0.113.7')
      .send(makeB2bLeadPayload());
    expect(blocked.status).toBe(429);
  });
});
