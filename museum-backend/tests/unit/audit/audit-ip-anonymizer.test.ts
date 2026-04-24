import { runAuditIpAnonymizer } from '@shared/audit/audit-ip-anonymizer.job';

import {
  createFakeAuditDataSource,
  makeAuditIpRow,
} from '../../helpers/audit/ip-anonymizer.fixtures';

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
});
