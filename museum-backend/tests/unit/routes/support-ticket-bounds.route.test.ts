import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { userToken } from '../../helpers/auth/token.helpers';

const mockCreateTicket = jest.fn();
const mockAddTicketMessage = jest.fn();

jest.mock('@modules/support/useCase', () => ({
  submitSupportContactUseCase: { execute: jest.fn() },
  createTicketUseCase: { execute: (...args: unknown[]) => mockCreateTicket(...args) },
  listUserTicketsUseCase: { execute: jest.fn() },
  getTicketDetailUseCase: { execute: jest.fn() },
  addTicketMessageUseCase: { execute: (...args: unknown[]) => mockAddTicketMessage(...args) },
  listAllTicketsUseCase: { execute: jest.fn() },
  updateTicketStatusUseCase: { execute: jest.fn() },
}));

const { app } = createRouteTestApp();

const DESCRIPTION = 'A description that is long enough';

const postTicket = (body: Record<string, unknown>) =>
  request(app)
    .post('/api/support/tickets')
    .set('Authorization', `Bearer ${userToken()}`)
    .send(body);

const postMessage = (text: string) =>
  request(app)
    .post('/api/support/tickets/7c9e6679-7425-40de-944b-e07fc1f90ae7/messages')
    .set('Authorization', `Bearer ${userToken()}`)
    .send({ text });

describe('L3 · un ticket respecte les bornes de l’écran et de la base', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });
    mockAddTicketMessage.mockResolvedValue({ id: 'message-1' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('un sujet de 200 caractères est créé, 201 sont refusés en 400', async () => {
    const accepted = await postTicket({ subject: 's'.repeat(200), description: DESCRIPTION });
    const refused = await postTicket({ subject: 's'.repeat(201), description: DESCRIPTION });

    expect(accepted.status).toBe(201);
    expect(refused.status).toBe(400);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
  });

  it('une catégorie de 64 caractères est créée, 65 sont refusés en 400', async () => {
    const accepted = await postTicket({
      subject: 'Login issue',
      description: DESCRIPTION,
      category: 'c'.repeat(64),
    });
    const refused = await postTicket({
      subject: 'Login issue',
      description: DESCRIPTION,
      category: 'c'.repeat(65),
    });

    expect(accepted.status).toBe(201);
    expect(refused.status).toBe(400);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
  });

  it('une réponse de 2 000 caractères est ajoutée, 2 001 sont refusés en 400', async () => {
    const accepted = await postMessage('m'.repeat(2000));
    const refused = await postMessage('m'.repeat(2001));

    expect(accepted.status).toBe(201);
    expect(refused.status).toBe(400);
    expect(mockAddTicketMessage).toHaveBeenCalledTimes(1);
  });
});
