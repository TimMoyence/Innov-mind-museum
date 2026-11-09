import type { DataSource, EntityManager } from 'typeorm';

import { runAuditIpAnonymizer } from '@shared/audit/audit-ip-anonymizer.job';

import {
  createFakeAuditDataSource,
  makeAuditIpRow,
} from '../../helpers/audit/ip-anonymizer.fixtures';

function makeDataSourceWithUpdateResult(
  selectedRows: { id: string; ip: string }[],
  updateResult: unknown,
): DataSource {
  const manager = {
    query: async (sql: string): Promise<unknown> => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith(`SET LOCAL app.audit_anonymization_allowed = 'true'`)) return [];
      if (normalized.startsWith('SELECT id, host(ip) AS ip')) return selectedRows;
      if (normalized.startsWith('UPDATE "audit_logs"')) return updateResult;
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
  return {
    transaction: async <T>(runner: (m: EntityManager) => Promise<T>): Promise<T> =>
      runner(manager as EntityManager),
  } as unknown as DataSource;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

describe('runAuditIpAnonymizer', () => {
  it('applies a /24 mask to IPv4 rows older than 13 months', async () => {
    const fake = createFakeAuditDataSource([
      makeAuditIpRow({
        id: '00000000-0000-0000-0000-000000000001',
        ip: '203.0.113.42',
        createdAt: monthsAgo(14),
      }),
    ]);

    const result = await runAuditIpAnonymizer(fake.dataSource);

    expect(result.anonymized).toBe(1);
    expect(fake.rows[0].ip).toBe('203.0.113.0');
    expect(fake.sawAnonymizationWhitelist).toBe(true);
  });

  it('applies a /64 mask to IPv6 rows older than 13 months', async () => {
    const fake = createFakeAuditDataSource([
      makeAuditIpRow({
        id: '00000000-0000-0000-0000-000000000002',
        ip: '2001:db8:85a3:0:1:2:3:4',
        createdAt: monthsAgo(14),
      }),
    ]);

    const result = await runAuditIpAnonymizer(fake.dataSource);

    expect(result.anonymized).toBe(1);
    expect(fake.rows[0].ip).toBe('2001:db8:85a3:0:0:0:0:0/64');
  });

  it('leaves rows younger than 13 months untouched', async () => {
    const fake = createFakeAuditDataSource([
      makeAuditIpRow({
        id: '00000000-0000-0000-0000-000000000003',
        ip: '198.51.100.7',
        createdAt: monthsAgo(6),
      }),
    ]);

    const result = await runAuditIpAnonymizer(fake.dataSource);

    expect(result.anonymized).toBe(0);
    expect(fake.rows[0].ip).toBe('198.51.100.7');
  });

  it('skips the UPDATE statement entirely when the SELECT returns zero rows', async () => {
    const fake = createFakeAuditDataSource([]);

    const result = await runAuditIpAnonymizer(fake.dataSource);

    expect(result.anonymized).toBe(0);
    expect(fake.queryCalls).toHaveLength(2);
    const updateIssued = fake.queryCalls.some((call) => /UPDATE\s+"audit_logs"/i.test(call.sql));
    expect(updateIssued).toBe(false);
  });

  it('emits the IPv4-only family filter literal in the UPDATE WHERE/CASE clause', async () => {
    const fake = createFakeAuditDataSource([
      makeAuditIpRow({
        id: '00000000-0000-0000-0000-000000000004',
        ip: '2001:db8::1',
        createdAt: monthsAgo(14),
      }),
    ]);

    await runAuditIpAnonymizer(fake.dataSource);

    const updateCall = fake.queryCalls.find((call) => /UPDATE\s+"audit_logs"/i.test(call.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall?.sql).toMatch(/family\("?ip"?\)\s*=\s*4/);
    expect(updateCall?.sql).toMatch(/family\("?ip"?\)\s*=\s*6/);
  });

  it("issues SET LOCAL app.audit_anonymization_allowed = 'true' before the UPDATE", async () => {
    const fake = createFakeAuditDataSource([
      makeAuditIpRow({
        id: '00000000-0000-0000-0000-000000000005',
        ip: '203.0.113.99',
        createdAt: monthsAgo(14),
      }),
    ]);

    await runAuditIpAnonymizer(fake.dataSource);

    const setIndex = fake.queryCalls.findIndex((call) =>
      /SET\s+LOCAL\s+app\.audit_anonymization_allowed\s*=\s*'true'/.test(call.sql),
    );
    const updateIndex = fake.queryCalls.findIndex((call) =>
      /UPDATE\s+"audit_logs"/i.test(call.sql),
    );

    expect(setIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeLessThan(updateIndex);
    expect(fake.queryCalls[setIndex].sql).not.toMatch(/'false'/);
  });

  it('uses driver-reported affectedCount when UPDATE returns [rows, number] (kills ConditionalExpression→false at L86)', async () => {
    const selected = [
      { id: '00000000-0000-0000-0000-00000000a001', ip: '203.0.113.1' },
      { id: '00000000-0000-0000-0000-00000000a002', ip: '203.0.113.2' },
      { id: '00000000-0000-0000-0000-00000000a003', ip: '203.0.113.3' },
    ];
    const ds = makeDataSourceWithUpdateResult(selected, [[], 7]);

    const result = await runAuditIpAnonymizer(ds);

    expect(result.anonymized).toBe(7);
    expect(result.anonymized).not.toBe(selected.length);
  });

  it('falls back to selected rows.length when UPDATE result lacks a numeric affectedCount (kills ConditionalExpression→true at L86)', async () => {
    const selected = [
      { id: '00000000-0000-0000-0000-00000000b001', ip: '198.51.100.1' },
      { id: '00000000-0000-0000-0000-00000000b002', ip: '198.51.100.2' },
    ];
    const ds = makeDataSourceWithUpdateResult(selected, [[], 'not-a-number']);

    const result = await runAuditIpAnonymizer(ds);

    expect(result.anonymized).toBe(selected.length);
    expect(result.anonymized).toBe(2);
    expect(typeof result.anonymized).toBe('number');
  });
});
