import request from 'supertest';

import { makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

import type { InMemorySupportRepository } from '../../helpers/support/inMemorySupportRepository';

jest.mock('@modules/support/useCase', () => {
  const { InMemorySupportRepository: Repository } = jest.requireActual<
    typeof import('../../helpers/support/inMemorySupportRepository')
  >('../../helpers/support/inMemorySupportRepository');
  const { GetTicketDetailUseCase } = jest.requireActual<
    typeof import('@modules/support/useCase/ticket-user/getTicketDetail.useCase')
  >('@modules/support/useCase/ticket-user/getTicketDetail.useCase');
  const { AddTicketMessageUseCase } = jest.requireActual<
    typeof import('@modules/support/useCase/ticket-user/addTicketMessage.useCase')
  >('@modules/support/useCase/ticket-user/addTicketMessage.useCase');
  const repository = new Repository();
  return {
    repository,
    getTicketDetailUseCase: new GetTicketDetailUseCase(repository),
    addTicketMessageUseCase: new AddTicketMessageUseCase(repository),
    submitSupportContactUseCase: { execute: jest.fn() },
    createTicketUseCase: { execute: jest.fn() },
    listUserTicketsUseCase: { execute: jest.fn() },
    listAllTicketsUseCase: { execute: jest.fn() },
    updateTicketStatusUseCase: { execute: jest.fn() },
  };
});

const { repository } = jest.requireMock<{ repository: InMemorySupportRepository }>(
  '@modules/support/useCase',
);
const { app } = createRouteTestApp();

const MUSEUM = 7;
const OTHER_MUSEUM = 8;

const seedTicket = (id: string, userId: number, museumId: number | null): void => {
  repository.seed({ id, userId, subject: 'Audio guide', description: 'The guide stops', museumId });
};

const open = (ticketId: string, claims: Record<string, unknown>) =>
  request(app)
    .get(`/api/support/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${makeToken(claims)}`);

const reply = (ticketId: string, claims: Record<string, unknown>) =>
  request(app)
    .post(`/api/support/tickets/${ticketId}/messages`)
    .set('Authorization', `Bearer ${makeToken(claims)}`)
    .send({ text: 'We are looking into it' });

const statusOf = async (ticketId: string): Promise<string | undefined> =>
  (await repository.getTicketById(ticketId))?.status;

describe('TICKET-ACCES · whoever sees a ticket in Admin › Tickets can open it and answer it', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it.each([
    ['super_admin', { role: 'super_admin' }],
    ['admin', { role: 'admin' }],
    ['moderator', { role: 'moderator' }],
    ['museum_manager of the ticket museum', { role: 'museum_manager', museumId: MUSEUM }],
  ])(
    'TICKET-ACCES · %s opens a visitor ticket, answers it, and the open ticket goes in progress',
    async (_who, claims) => {
      const ticketId = `staff-${claims.role}`;
      seedTicket(ticketId, 42, MUSEUM);

      const detail = await open(ticketId, claims);
      expect(detail.status).toBe(200);
      expect(detail.body.ticket.id).toBe(ticketId);

      const answer = await reply(ticketId, claims);
      expect(answer.status).toBe(201);
      expect(answer.body.message.senderRole).toBe(claims.role);
      expect(await statusOf(ticketId)).toBe('in_progress');
    },
  );

  it.each([
    ['a ticket of another museum', OTHER_MUSEUM, { role: 'museum_manager', museumId: MUSEUM }],
    ['a ticket with no museum', null, { role: 'museum_manager', museumId: MUSEUM }],
    ['any ticket when no museum is assigned', MUSEUM, { role: 'museum_manager' }],
    ['the ticket of another visitor', MUSEUM, { role: 'visitor' }],
  ])(
    'TICKET-ACCES · %s stays closed: 403 on opening and on answering, ticket untouched',
    async (what, museumId, claims) => {
      const ticketId = `closed-${what}`;
      seedTicket(ticketId, 42, museumId);

      const detail = await open(ticketId, claims);
      expect(detail.status).toBe(403);
      expect(detail.body.error.message).toBe('You do not have access to this ticket');

      const answer = await reply(ticketId, claims);
      expect(answer.status).toBe(403);
      expect(await statusOf(ticketId)).toBe('open');
    },
  );

  it.each([
    ['a visitor', { role: 'visitor' }],
    ['a museum_manager writing from another museum', { role: 'museum_manager', museumId: MUSEUM }],
  ])(
    'TICKET-ACCES · %s opens and answers their own ticket without moving it in progress',
    async (who, claims) => {
      const ticketId = `own-${who}`;
      seedTicket(ticketId, 1, OTHER_MUSEUM);

      expect((await open(ticketId, claims)).status).toBe(200);
      expect((await reply(ticketId, claims)).status).toBe(201);
      expect(await statusOf(ticketId)).toBe('open');
    },
  );

  it('TICKET-ACCES · an unknown ticket answers 404 to staff', async () => {
    const detail = await open('missing', { role: 'super_admin' });

    expect(detail.status).toBe(404);
    expect(detail.body.error.message).toBe('Ticket not found');
  });
});
