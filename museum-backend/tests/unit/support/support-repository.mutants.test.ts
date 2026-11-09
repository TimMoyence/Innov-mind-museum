import type { DataSource, Repository } from 'typeorm';

import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticket/ticketMessage.entity';

import { SupportRepositoryPg } from '@modules/support/adapters/secondary/pg/support.repository.pg';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSourceMulti } from 'tests/helpers/shared/mock-deps';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

function buildMocks() {
  const qb = makeMockQb();

  const { repo: ticketRepo } = makeMockTypeOrmRepo<SupportTicket>({ qb });
  const { repo: messageRepo } = makeMockTypeOrmRepo<TicketMessage>();

  const repoMap = new Map<unknown, unknown>([
    [SupportTicket, ticketRepo],
    [TicketMessage, messageRepo],
  ]);
  const dataSource = {
    ...makeMockDataSourceMulti(repoMap, ticketRepo),
  } as unknown as DataSource;

  return { ticketRepo, messageRepo, qb, dataSource };
}

describe('SupportRepositoryPg — mutation kills', () => {
  let sut: SupportRepositoryPg;
  let ticketRepo: jest.Mocked<Repository<SupportTicket>>;
  let qb: ReturnType<typeof makeMockQb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    ticketRepo = mocks.ticketRepo;
    qb = mocks.qb;
    sut = new SupportRepositoryPg(mocks.dataSource);
  });

  describe('toTicketDTO category nullish-coalescing (L26:15)', () => {
    it('preserves a truthy category when mapping the entity (kills `?? null` → `&& null`)', async () => {
      const entity = makeTicket({ category: 'billing' });
      ticketRepo.create.mockReturnValue(entity);
      ticketRepo.save.mockResolvedValue(entity);

      const result = await sut.createTicket({
        userId: 1,
        subject: 'help',
        description: 'pay',
        category: 'billing',
      });

      expect(result.category).toBe('billing');
      expect(result.category).not.toBeNull();
    });

    it('preserves a truthy assignedTo when mapping the entity (defence-in-depth on the same nullish pattern)', async () => {
      const entity = makeTicket({ assignedTo: 42 });
      ticketRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      ticketRepo.findOne.mockResolvedValue(entity);

      const result = await sut.updateTicket({ ticketId: 'ticket-001', assignedTo: 42 });

      expect(result?.assignedTo).toBe(42);
    });
  });

  describe('listTickets createQueryBuilder alias (L76:51)', () => {
    it('passes the literal alias "t" to ticketRepo.createQueryBuilder (kills StringLiteral → "")', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await sut.listTickets({ pagination: { page: 1, limit: 10 } });

      expect(ticketRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(ticketRepo.createQueryBuilder).toHaveBeenCalledWith('t');
    });
  });

  describe('listTickets messageCount alias (L95:10)', () => {
    it('passes the exact alias "messageCount" as the second arg of addSelect (kills StringLiteral → "")', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

      await sut.listTickets({ pagination: { page: 1, limit: 10 } });

      expect(qb.addSelect).toHaveBeenCalledTimes(1);
      const addSelectCall = qb.addSelect.mock.calls[0];
      expect(addSelectCall[1]).toBe('messageCount');
      expect(typeof addSelectCall[0]).toBe('function');
    });
  });

  describe('listTickets raw-row optional chaining (L105:52)', () => {
    it('falls back to messageCount = 0 when raw[idx] is undefined (kills OptionalChaining removal)', async () => {
      const tickets = [makeTicket({ id: 't1' }), makeTicket({ id: 't2' })];
      qb.getCount.mockResolvedValue(2);
      qb.getRawAndEntities.mockResolvedValue({
        entities: tickets,
        raw: [{ messageCount: '7' }],
      });

      const result = await sut.listTickets({ pagination: { page: 1, limit: 10 } });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].messageCount).toBe(7);
      expect(result.data[1].messageCount).toBe(0);
    });

    it('falls back to messageCount = 0 when raw row lacks the messageCount key', async () => {
      const tickets = [makeTicket({ id: 't1' })];
      qb.getCount.mockResolvedValue(1);
      qb.getRawAndEntities.mockResolvedValue({
        entities: tickets,
        raw: [{}],
      });

      const result = await sut.listTickets({ pagination: { page: 1, limit: 10 } });

      expect(result.data[0].messageCount).toBe(0);
    });
  });

  describe('updateTicket findOne arg shape (L164)', () => {
    it('calls findOne with the exact { where: { id: ticketId } } shape (kills both ObjectLiteral → {})', async () => {
      const updated = makeTicket({ id: 'ticket-xyz', status: 'closed' });
      ticketRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      ticketRepo.findOne.mockResolvedValue(updated);

      await sut.updateTicket({ ticketId: 'ticket-xyz', status: 'closed' });

      expect(ticketRepo.findOne).toHaveBeenCalledTimes(1);
      expect(ticketRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ticket-xyz' } });
    });

    it('passes the supplied ticketId through to findOne (not a hard-coded constant)', async () => {
      const updated = makeTicket({ id: 'ticket-other' });
      ticketRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      ticketRepo.findOne.mockResolvedValue(updated);

      await sut.updateTicket({ ticketId: 'ticket-other', priority: 'high' });

      const findOneArg = ticketRepo.findOne.mock.calls[0][0];
      expect(findOneArg).toEqual({ where: { id: 'ticket-other' } });
      expect(findOneArg).toHaveProperty('where');
      expect(findOneArg?.where).toEqual({ id: 'ticket-other' });
    });
  });
});
