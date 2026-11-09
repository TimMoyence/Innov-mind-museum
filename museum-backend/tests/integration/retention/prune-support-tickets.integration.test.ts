import type { Repository } from 'typeorm';

import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeTicket } from 'tests/helpers/support/ticket.fixtures';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);

describeIntegration('pruneSupportTickets (real PG) [integration]', () => {
  let harness: IntegrationHarness;
  let ticketRepo: Repository<SupportTicket>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    ticketRepo = harness.dataSource.getRepository(SupportTicket);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  async function insertTicket(params: {
    status: 'open' | 'closed' | 'resolved' | 'in_progress';
    updatedAt?: Date;
    seq: number;
  }): Promise<string> {
    const fixture = makeTicket({
      status: params.status,
      subject: `Ticket #${params.seq}`,
      description: `Body for ticket ${params.seq}`,
    });
    const saved = await ticketRepo.save(
      ticketRepo.create({
        userId: fixture.userId,
        subject: fixture.subject,
        description: fixture.description,
        status: fixture.status,
        priority: fixture.priority,
        category: fixture.category,
        assignedTo: fixture.assignedTo,
      }),
    );
    if (params.updatedAt) {
      await harness.dataSource.query(
        `UPDATE "support_tickets" SET "updatedAt" = $1 WHERE "id" = $2`,
        [params.updatedAt.toISOString(), saved.id],
      );
    }
    return saved.id;
  }

  it('R1+R4: deletes 50 eligible (closed/resolved >365d) rows, leaves 50 non-eligible untouched', async () => {
    for (let i = 0; i < 25; i += 1) {
      await insertTicket({ status: 'closed', updatedAt: daysAgo(400), seq: i });
    }
    for (let i = 25; i < 50; i += 1) {
      await insertTicket({ status: 'resolved', updatedAt: daysAgo(400), seq: i });
    }
    for (let i = 50; i < 75; i += 1) {
      await insertTicket({ status: 'open', updatedAt: daysAgo(400), seq: i });
    }
    for (let i = 75; i < 100; i += 1) {
      await insertTicket({ status: 'closed', updatedAt: daysAgo(10), seq: i });
    }

    expect(await ticketRepo.count()).toBe(100);

    const result = await pruneSupportTickets(harness.dataSource, {
      daysClosed: 365,
      batchLimit: 100,
    });

    expect(result.rowsAffected).toBe(50);
    expect(await ticketRepo.count()).toBe(50);
    expect(await ticketRepo.count({ where: { status: 'open' } })).toBe(25);
    expect(await ticketRepo.count({ where: { status: 'closed' } })).toBe(25);
    expect(await ticketRepo.count({ where: { status: 'resolved' } })).toBe(0);
  });

  it('R2: rowsAffected === 0 on empty table and terminates in <1s', async () => {
    expect(await ticketRepo.count()).toBe(0);

    const t0 = Date.now();
    const result = await pruneSupportTickets(harness.dataSource, {
      daysClosed: 365,
      batchLimit: 100,
    });
    const elapsed = Date.now() - t0;

    expect(result.rowsAffected).toBe(0);
    expect(elapsed).toBeLessThan(1000);
    expect(await ticketRepo.count()).toBe(0);
  });

  it('R3: multi-chunk — batchLimit=20 with 50 eligible rows deletes all 50 across chunks', async () => {
    for (let i = 0; i < 50; i += 1) {
      await insertTicket({ status: 'closed', updatedAt: daysAgo(400), seq: i });
    }
    for (let i = 50; i < 60; i += 1) {
      await insertTicket({ status: 'open', updatedAt: daysAgo(5), seq: i });
    }

    expect(await ticketRepo.count()).toBe(60);

    const result = await pruneSupportTickets(harness.dataSource, {
      daysClosed: 365,
      batchLimit: 20,
    });

    expect(result.rowsAffected).toBe(50);
    expect(await ticketRepo.count()).toBe(10);
    expect(await ticketRepo.count({ where: { status: 'open' } })).toBe(10);
  });
});
