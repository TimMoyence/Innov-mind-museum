import type { DataSource, EntityManager } from 'typeorm';

import { runAuditIpAnonymizer } from '@shared/audit/audit-ip-anonymizer.job';

import {
  createFakeAuditDataSource,
  makeAuditIpRow,
} from '../../helpers/audit/ip-anonymizer.fixtures';

/**
 * Builds a DataSource where the UPDATE statement returns the caller-chosen
 * shape, so tests can drive the L86 ternary
 *   `Array.isArray(result) && typeof result[1] === 'number' ? result[1] : rows.length`
 * down both branches deterministically.
 * @param selectedRows Rows the SELECT returns (drives `rows.length` in the job).
 * @param updateResult Exact value the UPDATE query returns.
 */
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

/**
 * Returns a Date N months before the current run so tests are time-robust
 * (fixed dates drift out of the 13-month window as the calendar advances).
 * @param n
 */
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
    // Empty table — the early-return at the top of the transaction must short-circuit
    // BEFORE any UPDATE is issued. A mutant removing the early-return would still call
    // UPDATE with an empty id array, which we can detect by counting query() invocations.
    const fake = createFakeAuditDataSource([]);

    const result = await runAuditIpAnonymizer(fake.dataSource);

    expect(result.anonymized).toBe(0);
    // Exactly two queries: the SET LOCAL whitelist + the SELECT. No UPDATE.
    expect(fake.queryCalls).toHaveLength(2);
    const updateIssued = fake.queryCalls.some((call) => /UPDATE\s+"audit_logs"/i.test(call.sql));
    expect(updateIssued).toBe(false);
  });

  it('emits the IPv4-only family filter literal in the UPDATE WHERE/CASE clause', async () => {
    // Capture the SQL the job actually issues and assert the literal `family("ip") = 4`
    // appears. A mutant flipping the equality target (4 → 6) would break IPv4 masking
    // silently, since the trigger and shape would still accept the statement.
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
    // Defense in depth: the IPv6 branch must keep its `= 6` literal alongside the IPv4 one.
    expect(updateCall?.sql).toMatch(/family\("?ip"?\)\s*=\s*6/);
  });

  it("issues SET LOCAL app.audit_anonymization_allowed = 'true' before the UPDATE", async () => {
    // The append-only trigger only lets the UPDATE through when this exact session
    // variable is set to the literal string 'true'. A mutant flipping the literal
    // ('true' → 'false') would still emit a SET, so we assert on the value AND on
    // the call ordering relative to the UPDATE.
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
    // Belt-and-braces: literal must be exactly 'true', not 'false' or any truthy alias.
    expect(fake.queryCalls[setIndex].sql).not.toMatch(/'false'/);
  });

  it('uses driver-reported affectedCount when UPDATE returns [rows, number] (kills ConditionalExpression→false at L86)', async () => {
    // Real condition is TRUE: result is [unknownRows, number] AND result[1] is number.
    // Original: anonymized = result[1] (the affected count).
    // Mutant `false`: anonymized = rows.length (fallback).
    // Distinguish by making result[1] !== rows.length: SELECT yields 3 rows but
    // UPDATE reports 7 affected. Real code returns 7; mutant returns 3.
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
    // Real condition is FALSE: result is an array but result[1] is NOT a number.
    // Original: anonymized = rows.length (fallback) — a defined positive int.
    // Mutant `true`: anonymized = result[1] which is `undefined`.
    // Asserting an exact number kills the mutant (undefined !== 2).
    const selected = [
      { id: '00000000-0000-0000-0000-00000000b001', ip: '198.51.100.1' },
      { id: '00000000-0000-0000-0000-00000000b002', ip: '198.51.100.2' },
    ];
    // Array, but result[1] is a string — `typeof result[1] === 'number'` is false.
    const ds = makeDataSourceWithUpdateResult(selected, [[], 'not-a-number']);

    const result = await runAuditIpAnonymizer(ds);

    expect(result.anonymized).toBe(selected.length);
    expect(result.anonymized).toBe(2);
    expect(typeof result.anonymized).toBe('number');
  });
});
