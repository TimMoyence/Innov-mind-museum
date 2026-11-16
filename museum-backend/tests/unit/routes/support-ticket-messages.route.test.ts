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

const reply = (ticketId: string, claims: Record<string, unknown>, text: string) =>
  request(app)
    .post(`/api/support/tickets/${ticketId}/messages`)
    .set('Authorization', `Bearer ${makeToken(claims)}`)
    .send({ text });

const messagesOf = async (ticketId: string, claims: Record<string, unknown>) =>
  (
    await request(app)
      .get(`/api/support/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${makeToken(claims)}`)
  ).body.ticket.messages as { text: string; fromStaff: boolean }[];

describe('TICKET-PERSONNEL · the server tells which ticket messages come from the staff', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('TICKET-PERSONNEL · a super_admin answer is a staff message, the author message is not', async () => {
    repository.seed({
      id: 'visitor-ticket',
      userId: 1,
      subject: 'Map',
      description: 'Map is blank',
      museumId: 7,
    });

    const author = await reply('visitor-ticket', { role: 'visitor' }, 'Still blank today');
    const staff = await reply(
      'visitor-ticket',
      { sub: '99', role: 'super_admin' },
      'Fixed, please retry',
    );

    expect(author.body.message.fromStaff).toBe(false);
    expect(staff.body.message.fromStaff).toBe(true);
    expect(await messagesOf('visitor-ticket', { role: 'visitor' })).toEqual([
      expect.objectContaining({ text: 'Still blank today', fromStaff: false }),
      expect.objectContaining({ text: 'Fixed, please retry', fromStaff: true }),
    ]);
  });

  it.each([
    ['an admin', { role: 'admin' }],
    ['a museum_manager of another museum', { role: 'museum_manager', museumId: 8 }],
  ])(
    'TICKET-PERSONNEL · %s writing on their own ticket is the author, not the staff',
    async (who, claims) => {
      const ticketId = `own-${who}`;
      repository.seed({
        id: ticketId,
        userId: 1,
        subject: 'Export',
        description: 'Export fails',
        museumId: 7,
      });

      const own = await reply(ticketId, claims, 'Any news?');

      expect(own.body.message.fromStaff).toBe(false);
      expect(await messagesOf(ticketId, claims)).toEqual([
        expect.objectContaining({ text: 'Any news?', fromStaff: false }),
      ]);
    },
  );
});
