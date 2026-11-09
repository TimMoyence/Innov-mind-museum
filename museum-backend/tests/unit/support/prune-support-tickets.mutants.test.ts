import { logger } from '@shared/logger/logger';
import { pruneSupportTickets } from '@modules/support/useCase/retention/prune-support-tickets';

import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

interface QueryCall {
  sql: string;
  params: unknown[];
}

interface FakeDataSource {
  ds: DataSource;
  calls: QueryCall[];
}

const makeFakeDataSource = (scripted: unknown[]): FakeDataSource => {
  const calls: QueryCall[] = [];
  let i = 0;
  const ds = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      const next = scripted[i] ?? [[], 0];
      i += 1;
      if (i > 50) throw new Error(`infinite-loop guard: query called ${i} times`);
      return next;
    },
  } as unknown as DataSource;
  return { ds, calls };
};

const tuple = (count: number): [{ id: string }[], number] => [
  Array.from({ length: count }, (_, k) => ({ id: `row-${k}` })),
  count,
];

describe('pruneSupportTickets — mutation kills', () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.error.mockClear();
  });

  describe('non-array query response falls back to chunkDeleted = 0 (L69:20)', () => {
    it('terminates with rowsAffected = 0 when the driver returns null (kills Array.isArray → true)', async () => {
      const { ds, calls } = makeFakeDataSource([null]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
      expect(mockedLogger.info).not.toHaveBeenCalled();
    });

    it('terminates with rowsAffected = 0 when the driver returns undefined', async () => {
      const { ds, calls } = makeFakeDataSource([undefined]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it('terminates with rowsAffected = 0 when the driver returns a non-array object', async () => {
      const { ds, calls } = makeFakeDataSource([{ rows: [], rowCount: 5 } as unknown]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it('terminates with rowsAffected = 0 when result[1] is undefined (kills typeof === "number" → true)', async () => {
      const { ds, calls } = makeFakeDataSource([[[], undefined]]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it('terminates with rowsAffected = 0 when result[1] is a numeric string (kills typeof === "number" → true)', async () => {
      const { ds, calls } = makeFakeDataSource([[[], '5'] as unknown]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
    });
  });

  describe('log gate (L71:9)', () => {
    it('NEVER logs when the very first chunk returns zero rows (kills `true` and `>= 0`)', async () => {
      const { ds, calls } = makeFakeDataSource([tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(0);
      expect(calls).toHaveLength(1);
      expect(mockedLogger.info).not.toHaveBeenCalled();
    });

    it('DOES log on a non-empty chunk with the exact event name and payload (kills `false` and ensures block content survives)', async () => {
      const { ds } = makeFakeDataSource([tuple(3), tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(3);
      const chunkLogs = mockedLogger.info.mock.calls.filter(
        ([event]) => event === 'prune_support_tickets_chunk',
      );
      expect(chunkLogs).toHaveLength(1);
      expect(chunkLogs[0][0]).toBe('prune_support_tickets_chunk');
      expect(chunkLogs[0][1]).toEqual({ deleted: 3, totalSoFar: 3 });
    });

    it('logs only on positive chunks, NOT on the terminating zero chunk (kills `>= 0` and `true`)', async () => {
      const { ds } = makeFakeDataSource([tuple(2), tuple(1), tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.rowsAffected).toBe(3);
      const chunkLogs = mockedLogger.info.mock.calls.filter(
        ([event]) => event === 'prune_support_tickets_chunk',
      );
      expect(chunkLogs).toHaveLength(2);
      expect(chunkLogs[0][1]).toEqual({ deleted: 2, totalSoFar: 2 });
      expect(chunkLogs[1][1]).toEqual({ deleted: 1, totalSoFar: 3 });
    });
  });

  it('sleeps (~50ms) after a non-empty chunk and skips sleep on the empty terminator', async () => {
    const { ds } = makeFakeDataSource([tuple(1), tuple(0)]);

    const start = performance.now();
    await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
    const chunkLogs = mockedLogger.info.mock.calls.filter(
      ([event]) => event === 'prune_support_tickets_chunk',
    );
    expect(chunkLogs).toHaveLength(1);
  });

  describe('result.details payload shape (L82:14)', () => {
    it('returns details = { cutoffDate: ISO string, daysClosed: <cfg.daysClosed> } (kills ObjectLiteral → {})', async () => {
      const { ds } = makeFakeDataSource([tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 365, batchLimit: 1000 });

      expect(result.details).toEqual({
        cutoffDate: expect.any(String),
        daysClosed: 365,
      });
      expect(Number.isNaN(Date.parse(result.details.cutoffDate as string))).toBe(false);
    });

    it('propagates a different daysClosed value through to result.details (kills hard-coded literal mutants)', async () => {
      const { ds } = makeFakeDataSource([tuple(0)]);

      const result = await pruneSupportTickets(ds, { daysClosed: 30, batchLimit: 500 });

      expect(result.details).toEqual({
        cutoffDate: expect.any(String),
        daysClosed: 30,
      });
    });
  });
});
