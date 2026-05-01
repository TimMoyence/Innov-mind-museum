import type { DataSource, Repository, UpdateResult } from 'typeorm';

import { SupportTicket } from '@modules/support/domain/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticketMessage.entity';

import { SupportRepositoryPg } from '@modules/support/adapters/secondary/support.repository.pg';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSourceMulti } from 'tests/helpers/shared/mock-deps';
import { makeTicket, makeTicketMessage } from 'tests/helpers/support/ticket.fixtures';

function buildMocks() {
  const qb = makeMockQb();

  const { repo: ticketRepo } = makeMockTypeOrmRepo<SupportTicket>({ qb });
  const { repo: messageRepo } = makeMockTypeOrmRepo<TicketMessage>();

  const txMsgRepo = { create: jest.fn(), save: jest.fn() };
  const txTktRepo = { update: jest.fn() };

  const repoMap = new Map<unknown, unknown>([
    [SupportTicket, ticketRepo],
    [TicketMessage, messageRepo],
  ]);
  const dataSource = {
    ...makeMockDataSourceMulti(repoMap, ticketRepo),
    transaction: jest.fn(
      (cb: (manager: { getRepository: (e: unknown) => unknown }) => Promise<unknown>) =>
        cb({
          getRepository: (entity: unknown) => {
            if (entity === TicketMessage) return txMsgRepo;
            if (entity === SupportTicket) return txTktRepo;
            return txMsgRepo;
          },
        }),
    ),
  } as unknown as DataSource;

  return { ticketRepo, messageRepo, qb, dataSource, txMsgRepo, txTktRepo };
}

describe('SupportRepositoryPg', () => {
  let sut: SupportRepositoryPg;
  let ticketRepo: jest.Mocked<Repository<SupportTicket>>;
  let messageRepo: jest.Mocked<Repository<TicketMessage>>;
  let qb: ReturnType<typeof makeMockQb>;
  let dataSource: DataSource;
  let txMsgRepo: { create: jest.Mock; save: jest.Mock };
  let txTktRepo: { update: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    ticketRepo = mocks.ticketRepo;
    messageRepo = mocks.messageRepo;
    qb = mocks.qb;
    dataSource = mocks.dataSource;
    txMsgRepo = mocks.txMsgRepo;
    txTktRepo = mocks.txTktRepo;
    sut = new SupportRepositoryPg(dataSource);
  });

  // ─── createTicket ───
  describe('createTicket', () => {
    it('creates ticket with default priority and returns DTO', async () => {
      const entity = makeTicket();
      ticketRepo.create.mockReturnValue(entity);
      ticketRepo.save.mockResolvedValue(entity);

      const result = await sut.createTicket({
        userId: 1,
        subject: 'Help needed',
        description: 'I have a problem',
      });

      expect(ticketRepo.create).toHaveBeenCalledWith({
        userId: 1,
        subject: 'Help needed',
        description: 'I have a problem',
        priority: 'medium',
        category: null,
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'ticket-001',
          userId: 1,
          subject: 'Help needed',
          status: 'open',
          priority: 'medium',
        }),
      );
      expect(typeof result.createdAt).toBe('string');
    });

    it('uses provided priority and category', async () => {
      const entity = makeTicket({ priority: 'high', category: 'bug' });
      ticketRepo.create.mockReturnValue(entity);
      ticketRepo.save.mockResolvedValue(entity);

      await sut.createTicket({
        userId: 1,
        subject: 'Bug',
        description: 'Critical',
        priority: 'high',
        category: 'bug',
      });

      expect(ticketRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
          category: 'bug',
        }),
      );
    });
  });

  // ─── listTickets ───
  describe('listTickets', () => {
    it('returns paginated tickets without filters', async () => {
      const tickets = [makeTicket({ id: 't1' }), makeTicket({ id: 't2' })];
      qb.getCount.mockResolvedValue(2);
      qb.getRawAndEntities.mockResolvedValue({
        entities: tickets,
        raw: [{ messageCount: '3' }, { messageCount: '0' }],
      });

      const result = await sut.listTickets({
        pagination: { page: 1, limit: 10 },
      });

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('t.updatedAt', 'DESC');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].messageCount).toBe(3);
      expect(result.data[1].messageCount).toBe(0);
      expect(result.total).toBe(2);
    });

    it('applies userId filter', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await sut.listTickets({
        userId: 5,
        pagination: { page: 1, limit: 10 },
      });

      expect(qb.andWhere).toHaveBeenCalledWith('t.userId = :userId', { userId: 5 });
    });

    it('applies status filter', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await sut.listTickets({
        status: 'resolved',
        pagination: { page: 1, limit: 10 },
      });

      expect(qb.andWhere).toHaveBeenCalledWith('t.status = :status', { status: 'resolved' });
    });

    it('applies priority filter', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await sut.listTickets({
        priority: 'high',
        pagination: { page: 1, limit: 10 },
      });

      expect(qb.andWhere).toHaveBeenCalledWith('t.priority = :priority', { priority: 'high' });
    });

    it('computes correct offset for page 3', async () => {
      qb.getCount.mockResolvedValue(25);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      const result = await sut.listTickets({
        pagination: { page: 3, limit: 10 },
      });

      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(result.totalPages).toBe(3);
    });
  });

  // ─── getTicketById ───
  describe('getTicketById', () => {
    it('returns ticket detail with messages', async () => {
      const ticket = makeTicket();
      const messages = [
        makeTicketMessage({ id: 'm1', text: 'First' }),
        makeTicketMessage({ id: 'm2', text: 'Second' }),
      ];
      ticketRepo.findOne.mockResolvedValue(ticket);
      messageRepo.find.mockResolvedValue(messages);

      const result = await sut.getTicketById('ticket-001');

      expect(ticketRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ticket-001' } });
      expect(messageRepo.find).toHaveBeenCalledWith({
        where: { ticketId: 'ticket-001' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toBeDefined();
      expect(result?.messages).toHaveLength(2);
      expect(result?.messages[0].text).toBe('First');
    });

    it('returns null when ticket not found', async () => {
      ticketRepo.findOne.mockResolvedValue(null);

      const result = await sut.getTicketById('nonexistent');

      expect(result).toBeNull();
      expect(messageRepo.find).not.toHaveBeenCalled();
    });
  });

  // ─── addMessage ───
  describe('addMessage', () => {
    it('creates message and bumps ticket updatedAt in transaction', async () => {
      const savedMsg = makeTicketMessage({ text: 'New message' });
      txMsgRepo.create.mockReturnValue(savedMsg);
      txMsgRepo.save.mockResolvedValue(savedMsg);
      txTktRepo.update.mockResolvedValue({ affected: 1 });

      const result = await sut.addMessage({
        ticketId: 'ticket-001',
        senderId: 1,
        senderRole: 'visitor',
        text: 'New message',
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(txMsgRepo.create).toHaveBeenCalledWith({
        ticketId: 'ticket-001',
        senderId: 1,
        senderRole: 'visitor',
        text: 'New message',
      });
      expect(txTktRepo.update).toHaveBeenCalledWith('ticket-001', {
        updatedAt: expect.any(Date),
      });
      expect(result).toEqual(
        expect.objectContaining({
          text: 'New message',
          ticketId: 'ticket-001',
        }),
      );
    });
  });

  // ─── updateTicket ───
  describe('updateTicket', () => {
    it('updates status and returns DTO', async () => {
      const updated = makeTicket({ status: 'in_progress' });
      ticketRepo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      ticketRepo.findOne.mockResolvedValue(updated);

      const result = await sut.updateTicket({
        ticketId: 'ticket-001',
        status: 'in_progress',
      });

      expect(ticketRepo.update).toHaveBeenCalledWith('ticket-001', { status: 'in_progress' });
      expect(result?.status).toBe('in_progress');
    });

    it('updates priority field', async () => {
      const updated = makeTicket({ priority: 'high' });
      ticketRepo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      ticketRepo.findOne.mockResolvedValue(updated);

      const result = await sut.updateTicket({
        ticketId: 'ticket-001',
        priority: 'high',
      });

      expect(ticketRepo.update).toHaveBeenCalledWith('ticket-001', { priority: 'high' });
      expect(result?.priority).toBe('high');
    });

    it('updates assignedTo field', async () => {
      const updated = makeTicket({ assignedTo: 42 });
      ticketRepo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      ticketRepo.findOne.mockResolvedValue(updated);

      const result = await sut.updateTicket({
        ticketId: 'ticket-001',
        assignedTo: 42,
      });

      expect(ticketRepo.update).toHaveBeenCalledWith('ticket-001', { assignedTo: 42 });
      expect(result?.assignedTo).toBe(42);
    });

    it('returns null when no fields to update', async () => {
      const result = await sut.updateTicket({ ticketId: 'ticket-001' });

      expect(result).toBeNull();
      expect(ticketRepo.update).not.toHaveBeenCalled();
    });

    it('returns null when ticket not found (affected=0)', async () => {
      ticketRepo.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      const result = await sut.updateTicket({
        ticketId: 'nonexistent',
        status: 'closed',
      });

      expect(result).toBeNull();
    });

    it('returns null when findOne returns null after update', async () => {
      ticketRepo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      ticketRepo.findOne.mockResolvedValue(null);

      const result = await sut.updateTicket({
        ticketId: 'ticket-001',
        status: 'closed',
      });

      expect(result).toBeNull();
    });
  });

  // ─── isTicketOwner ───
  describe('isTicketOwner', () => {
    it('returns true when user owns the ticket', async () => {
      ticketRepo.count.mockResolvedValue(1);

      const result = await sut.isTicketOwner('ticket-001', 1);

      expect(result).toBe(true);
      expect(ticketRepo.count).toHaveBeenCalledWith({
        where: { id: 'ticket-001', userId: 1 },
      });
    });

    it('returns false when user does not own the ticket', async () => {
      ticketRepo.count.mockResolvedValue(0);

      const result = await sut.isTicketOwner('ticket-001', 999);

      expect(result).toBe(false);
    });
  });
});
