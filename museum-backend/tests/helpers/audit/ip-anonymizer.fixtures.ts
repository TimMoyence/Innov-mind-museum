import type { DataSource, EntityManager } from 'typeorm';

/** Row shape stored by the in-memory fake — mirrors the `audit_logs` columns touched by the job. */
export interface FakeAuditRow {
  id: string;
  ip: string | null;
  createdAt: Date;
}

/** Factory output so tests can introspect state + drive the DataSource. */
export interface FakeAuditDataSource {
  dataSource: DataSource;
  rows: FakeAuditRow[];
  /** Flag flipped to `true` while a transaction set `app.audit_anonymization_allowed`. */
  sawAnonymizationWhitelist: boolean;
}

/**
 * Builds an audit_log row with sensible defaults for the anonymizer tests.
 * @param overrides
 */
export function makeAuditIpRow(overrides: Partial<FakeAuditRow> = {}): FakeAuditRow {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    ip: overrides.ip ?? '203.0.113.42',
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
  };
}

/**
 * Zeroes the last octet of an IPv4 dotted string (mirrors `inet & 255.255.255.0`).
 * @param ip
 */
function maskIpv4(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/**
 * Keeps the top 64 bits of an IPv6 address + appends the /64 CIDR suffix (mirrors set_masklen).
 * @param ip
 */
function maskIpv6(ip: string): string {
  const [addr] = ip.split('/');
  const expanded = addr.split(':');
  // Very small helper: we only need correctness on the fixture inputs (which
  // are already compact hextet strings, 8 groups). Pad missing groups with 0.
  while (expanded.length < 8) expanded.push('0');
  const hi = expanded.slice(0, 4).join(':');
  return `${hi}:0:0:0:0/64`;
}

/**
 * Builds an in-memory fake `DataSource` that emulates exactly the SQL shapes
 * `runAuditIpAnonymizer` issues:
 *   - SET LOCAL app.audit_anonymization_allowed = 'true'
 *   - SELECT id, host(ip) AS ip FROM audit_logs WHERE created_at < NOW() - INTERVAL '13 months' AND ip IS NOT NULL LIMIT $1
 *   - UPDATE audit_logs SET ip = CASE WHEN family(ip) = 4 THEN ... WHEN family(ip) = 6 THEN ... END WHERE id = ANY($1)
 *
 * Any other SQL throws loudly so drift in the job is caught immediately.
 * @param initialRows
 */
export function createFakeAuditDataSource(initialRows: FakeAuditRow[]): FakeAuditDataSource {
  const state: { rows: FakeAuditRow[]; sawAnonymizationWhitelist: boolean } = {
    rows: initialRows.map((row) => ({ ...row })),
    sawAnonymizationWhitelist: false,
  };

  const thirteenMonthsAgo = (): Date => {
    const now = new Date();
    const d = new Date(now);
    d.setMonth(d.getMonth() - 13);
    return d;
  };

  const manager = {
    query: async <T>(sql: string, params?: unknown[]): Promise<T> => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith(`SET LOCAL app.audit_anonymization_allowed = 'true'`)) {
        state.sawAnonymizationWhitelist = true;
        return [] as unknown as T;
      }

      if (normalized.startsWith('SELECT id, host(ip) AS ip')) {
        const limit = Number(params?.[0] ?? 0);
        const cutoff = thirteenMonthsAgo();
        const matches = state.rows
          .filter((r) => r.ip !== null && r.createdAt.getTime() < cutoff.getTime())
          .slice(0, limit)
          .map((r) => ({ id: r.id, ip: r.ip! }));
        return matches as unknown as T;
      }

      if (normalized.startsWith('UPDATE "audit_logs"')) {
        const ids = (params?.[0] ?? []) as string[];
        let affected = 0;
        for (const row of state.rows) {
          if (!ids.includes(row.id) || row.ip === null) continue;
          row.ip = row.ip.includes(':') ? maskIpv6(row.ip) : maskIpv4(row.ip);
          affected += 1;
        }
        return [[], affected] as unknown as T;
      }

      throw new Error(`Unexpected SQL in fake DataSource: ${normalized}`);
    },
  };

  const dataSource = {
    transaction: async <T>(runner: (m: EntityManager) => Promise<T>): Promise<T> => {
      return runner(manager as EntityManager);
    },
  } as unknown as DataSource;

  return {
    dataSource,
    rows: state.rows,
    get sawAnonymizationWhitelist(): boolean {
      return state.sawAnonymizationWhitelist;
    },
  } as FakeAuditDataSource;
}
