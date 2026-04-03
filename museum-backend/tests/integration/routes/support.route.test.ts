import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';

// ── Mock use cases so handlers execute without DB ────────────────────

const mockSubmitSupportContact = jest.fn();
const mockCreateTicket = jest.fn();
const mockListUserTickets = jest.fn();
const mockGetTicketDetail = jest.fn();
const mockAddTicketMessage = jest.fn();

jest.mock('@modules/support/useCase', () => ({
  submitSupportContactUseCase: {
    execute: (...args: unknown[]) => mockSubmitSupportContact(...args),
  },
  createTicketUseCase: { execute: (...args: unknown[]) => mockCreateTicket(...args) },
  listUserTicketsUseCase: { execute: (...args: unknown[]) => mockListUserTickets(...args) },
  getTicketDetailUseCase: { execute: (...args: unknown[]) => mockGetTicketDetail(...args) },
  addTicketMessageUseCase: { execute: (...args: unknown[]) => mockAddTicketMessage(...args) },
  // Admin use cases also imported by admin.route — provide stubs
  listAllTicketsUseCase: { execute: jest.fn() },
  updateTicketStatusUseCase: { execute: jest.fn() },
}));

/**
 * Support route integration tests — auth enforcement + validation + happy-path handler bodies.
 * No DB required — use cases are mocked.
 */

const { app } = createRouteTestApp();

describe('Support Routes — HTTP Layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Unauthenticated access returns 401 ─────────────────────────

  describe('Unauthenticated access returns 401', () => {
    it('POST /api/support/tickets returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .send({ subject: 'Test', description: 'A description that is long enough' });
      expect(res.status).toBe(401);
    });

    it('GET /api/support/tickets returns 401 without token', async () => {
      const res = await request(app).get('/api/support/tickets');
      expect(res.status).toBe(401);
    });

    it('GET /api/support/tickets/:id returns 401 without token', async () => {
      const res = await request(app).get('/api/support/tickets/some-uuid');
      expect(res.status).toBe(401);
    });

    it('POST /api/support/tickets/:id/messages returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/support/tickets/some-uuid/messages')
        .send({ text: 'hello' });
      expect(res.status).toBe(401);
    });
  });

  // ── Public contact endpoint (no auth) ─────────────────────────

  describe('POST /api/support/contact — public form', () => {
    it('accepts a valid payload without authentication', async () => {
      const res = await request(app).post('/api/support/contact').send({
        name: 'Visitor',
        email: 'visitor@example.com',
        message: 'Hello, I need help with the mobile app support flow.',
      });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app).post('/api/support/contact').send({
        name: 'Visitor',
        email: 'invalid-email',
        message: 'Hello, I need help with the mobile app support flow.',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for too-short message', async () => {
      const res = await request(app).post('/api/support/contact').send({
        name: 'Visitor',
        email: 'visitor@example.com',
        message: 'short',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── Invalid token returns 401 ──────────────────────────────────

  describe('Invalid token returns 401', () => {
    it('returns 401 for token signed with wrong secret', async () => {
      const badToken = jwt.sign({ sub: '1', type: 'access', jti: 'jti' }, 'wrong-secret', {
        expiresIn: '5m',
      });
      const res = await request(app)
        .get('/api/support/tickets')
        .set('Authorization', `Bearer ${badToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/support/tickets — body validation ────────────────

  describe('POST /api/support/tickets — validation', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for subject too short (< 3 chars)', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ subject: 'ab', description: 'A description that is long enough' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for description too short (< 10 chars)', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ subject: 'Valid Subject', description: 'Short' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing subject', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ description: 'A description that is long enough' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing description', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ subject: 'Valid Subject' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid priority value', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({
          subject: 'Valid Subject',
          description: 'A description that is long enough',
          priority: 'critical',
        });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/support/tickets/:id/messages — body validation ───

  describe('POST /api/support/tickets/:id/messages — validation', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/support/tickets/fake-id/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing text field', async () => {
      const res = await request(app)
        .post('/api/support/tickets/fake-id/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ wrongField: 'value' });
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ──────────────────────────────────────

  describe('Error response format', () => {
    it('401 returns structured JSON with error field', async () => {
      const res = await request(app).get('/api/support/tickets');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('400 validation returns structured JSON with error field', async () => {
      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
    });
  });

  // ── Happy-path handler body coverage ─────────────────────────────

  describe('Happy-path — handler bodies', () => {
    it('POST /api/support/contact submits support contact', async () => {
      mockSubmitSupportContact.mockResolvedValueOnce(undefined);

      const res = await request(app).post('/api/support/contact').send({
        name: 'Visitor',
        email: 'visitor@example.com',
        message: 'Hello, I need help with the mobile app support flow.',
      });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ accepted: true });
      expect(mockSubmitSupportContact).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Visitor',
          email: 'visitor@example.com',
          message: 'Hello, I need help with the mobile app support flow.',
        }),
      );
    });

    it('POST /api/support/tickets creates a ticket', async () => {
      const ticket = {
        id: 'tkt-uuid-1',
        subject: 'Cannot log in',
        description: 'I keep getting an error when logging in with my credentials.',
        status: 'open',
        priority: 'medium',
      };
      mockCreateTicket.mockResolvedValueOnce(ticket);

      const res = await request(app)
        .post('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({
          subject: 'Cannot log in',
          description: 'I keep getting an error when logging in with my credentials.',
          priority: 'medium',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ticket });
      expect(mockCreateTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Cannot log in',
          priority: 'medium',
          userId: 1,
        }),
      );
    });

    it('GET /api/support/tickets lists user tickets', async () => {
      const result = {
        data: [{ id: 'tkt-1', subject: 'Help', status: 'open' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListUserTickets.mockResolvedValueOnce(result);

      const res = await request(app)
        .get('/api/support/tickets')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
      expect(mockListUserTickets).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, page: 1, limit: 20 }),
      );
    });

    it('GET /api/support/tickets/:id gets ticket detail', async () => {
      const ticket = {
        id: 'tkt-uuid-1',
        subject: 'Help',
        description: 'Details here',
        messages: [],
      };
      mockGetTicketDetail.mockResolvedValueOnce(ticket);

      const res = await request(app)
        .get('/api/support/tickets/tkt-uuid-1')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket });
      expect(mockGetTicketDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'tkt-uuid-1',
          userId: 1,
          userRole: 'visitor',
        }),
      );
    });

    it('POST /api/support/tickets/:id/messages adds a message', async () => {
      const message = { id: 'msg-1', text: 'Thanks for the reply', senderId: 1 };
      mockAddTicketMessage.mockResolvedValueOnce(message);

      const res = await request(app)
        .post('/api/support/tickets/tkt-uuid-1/messages')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ text: 'Thanks for the reply' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message });
      expect(mockAddTicketMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'tkt-uuid-1',
          senderId: 1,
          senderRole: 'visitor',
          text: 'Thanks for the reply',
        }),
      );
    });

    it('use case error is forwarded as 500', async () => {
      mockGetTicketDetail.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(app)
        .get('/api/support/tickets/tkt-uuid-1')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(500);
    });
  });
});
