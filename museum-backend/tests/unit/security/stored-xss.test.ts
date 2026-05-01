import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';
import { XSS_PAYLOADS } from '../../helpers/security/payloads';

/**
 * Stored-XSS security test suite.
 *
 * Policy (contract):
 *  1. Backend stores user-controlled text as-is (users have the right to special
 *     characters — we do NOT strip `<`, `>`, quotes, etc. at persistence).
 *  2. API responses are ALWAYS `application/json` — so even if a payload
 *     contains `<script>`, it is returned as an inert JSON string value and
 *     cannot execute in any browser context that correctly sets Content-Type.
 *  3. XSS defense for the admin UI is the responsibility of `museum-web`
 *     (React auto-escapes text by default). This test pins the backend side
 *     of the contract only.
 *
 * Covers POST `/api/reviews`, POST `/api/support/tickets`, POST
 * `/api/support/contact` against three canonical payloads (`<script>`,
 * `<img onerror>`, a polyglot).
 */

// ── Mock use cases so handlers execute without a real DB ─────────────

const capturedReviews: Record<string, unknown>[] = [];
const capturedTickets: Record<string, unknown>[] = [];
const capturedContacts: Record<string, unknown>[] = [];

jest.mock('@modules/review/useCase', () => ({
  createReviewUseCase: {
    execute: (input: Record<string, unknown>) => {
      capturedReviews.push(input);
      return Promise.resolve({
        id: 'review-xss',
        userId:
          input.user && typeof input.user === 'object' ? (input.user as { id: number }).id : 1,
        userName: 'Author',
        rating: input.rating,
        comment: input.comment,
        status: 'pending',
        createdAt: new Date('2026-04-24').toISOString(),
        updatedAt: new Date('2026-04-24').toISOString(),
      });
    },
  },
  listApprovedReviewsUseCase: { execute: jest.fn() },
  getReviewStatsUseCase: { execute: jest.fn() },
  listAllReviewsUseCase: { execute: jest.fn() },
  moderateReviewUseCase: { execute: jest.fn() },
}));

jest.mock('@modules/support/useCase', () => ({
  submitSupportContactUseCase: {
    execute: (input: Record<string, unknown>) => {
      capturedContacts.push(input);
      return Promise.resolve();
    },
  },
  createTicketUseCase: {
    execute: (input: Record<string, unknown>) => {
      capturedTickets.push(input);
      return Promise.resolve({
        id: 'ticket-xss',
        userId: input.userId,
        subject: input.subject,
        description: input.description,
        priority: input.priority ?? 'medium',
        status: 'open',
        createdAt: new Date('2026-04-24').toISOString(),
        updatedAt: new Date('2026-04-24').toISOString(),
      });
    },
  },
  listUserTicketsUseCase: { execute: jest.fn() },
  getTicketDetailUseCase: { execute: jest.fn() },
  addTicketMessageUseCase: { execute: jest.fn() },
  listAllTicketsUseCase: { execute: jest.fn() },
  updateTicketStatusUseCase: { execute: jest.fn() },
}));

// Review route fetches the user profile through its own UserRepositoryPg —
// patch the DefaultReviewRouter author resolver by mocking UserRepositoryPg.
jest.mock('@modules/auth/adapters/secondary/user.repository.pg', () => ({
  UserRepositoryPg: class {
    async getUserById(id: number) {
      return { id, firstname: 'Test', lastname: 'User' };
    }
  },
}));

const { app } = createRouteTestApp();

describe('Stored-XSS — backend persistence + response contract', () => {
  beforeEach(() => {
    resetRateLimits();
    capturedReviews.length = 0;
    capturedTickets.length = 0;
    capturedContacts.length = 0;
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('POST /api/reviews — payload round-trip', () => {
    it.each(Object.entries(XSS_PAYLOADS))(
      'persists payload %s verbatim and serializes it as JSON',
      async (_name, payload) => {
        const body = `Great museum! ${payload}`;
        const res = await request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${userToken()}`)
          .send({ rating: 5, comment: body });

        expect(res.status).toBe(201);

        // Backend MUST store the payload as-is — no silent sanitization.
        const captured = capturedReviews[0];
        expect(captured.comment).toBe(body);

        // Response MUST be JSON — so the payload is an inert string value.
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.review.comment).toBe(body);
      },
    );
  });

  describe('POST /api/support/tickets — payload round-trip', () => {
    it.each(Object.entries(XSS_PAYLOADS))(
      'persists payload %s in subject + description and returns JSON',
      async (_name, payload) => {
        const subject = `Issue ${payload}`;
        const description = `Full repro with payload: ${payload} — please escalate.`;

        const res = await request(app)
          .post('/api/support/tickets')
          .set('Authorization', `Bearer ${userToken()}`)
          .send({ subject, description });

        expect(res.status).toBe(201);

        const captured = capturedTickets[0];
        expect(captured.subject).toBe(subject);
        expect(captured.description).toBe(description);

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.ticket.subject).toBe(subject);
        expect(res.body.ticket.description).toBe(description);
      },
    );
  });

  describe('POST /api/support/contact — payload round-trip', () => {
    it.each(Object.entries(XSS_PAYLOADS))(
      'persists payload %s in the public contact form and returns JSON',
      async (_name, payload) => {
        const message = `Contact message — ${payload} — with sufficient length.`;

        const res = await request(app).post('/api/support/contact').send({
          name: 'Visitor',
          email: 'visitor@example.com',
          message,
        });

        expect(res.status).toBe(202);

        const captured = capturedContacts[0];
        expect(captured.message).toBe(message);

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({ accepted: true });
      },
    );
  });

  describe('admin-visible list responses stay JSON (no HTML rendering server-side)', () => {
    // The backend never renders user content as HTML — this is the property
    // that makes stored XSS harmless at the API boundary. All admin listing
    // endpoints we ship respond with `application/json`.
    it('review POST response Content-Type is JSON, not text/html', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ rating: 4, comment: `Neutral body ${XSS_PAYLOADS.scriptTag}` });

      expect(res.status).toBe(201);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-type']).not.toMatch(/text\/html/);
    });
  });
});
