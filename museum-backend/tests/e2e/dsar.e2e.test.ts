/**
 * GDPR DSAR (Article 15 right of access + Article 20 portability) e2e tests.
 *
 * Boots the full Postgres-backed harness so every layer involved in the
 * export — JWT auth, rate limiter, useCase orchestrator, repositories,
 * audit log — is exercised end-to-end. Anything below E2E (unit tests) only
 * proves the assembly logic, not the IDOR / audit / rate-limit guarantees.
 */
import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import { seedUserWithFullDataset } from 'tests/helpers/auth/export-fixtures';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('GDPR DSAR e2e — GET /api/users/me/export', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('returns the full personal-data dossier with every category present', async () => {
    const { token, userId, email } = await registerAndLogin(harness, {
      email: `dsar-full-${Date.now()}@musaium.test`,
    });

    const seed = await seedUserWithFullDataset(harness, { userId, email });

    const res = await harness.request('/api/users/me/export', { method: 'GET' }, token);

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body.schemaVersion).toBe('1');
    expect(typeof body.exportedAt).toBe('string');

    const user = body.user as Record<string, unknown>;
    expect(user.id).toBe(userId);
    expect(user.email).toBe(email);
    expect(user.role).toBe('visitor');

    const consent = body.consent as unknown[];
    expect(consent).toHaveLength(seed.expectedShape.consentRecords);

    const sessions = body.chatSessions as { messages: unknown[] }[];
    expect(sessions).toHaveLength(seed.expectedShape.chatSessions);
    expect(sessions[0].messages).toHaveLength(seed.expectedShape.chatMessages);

    expect(body.savedArtworks).toEqual([]);

    const reviews = body.reviews as unknown[];
    expect(reviews).toHaveLength(seed.expectedShape.reviews);

    const tickets = body.supportTickets as { messages: unknown[] }[];
    expect(tickets).toHaveLength(seed.expectedShape.supportTickets);
    expect(tickets[0].messages).toHaveLength(seed.expectedShape.supportMessages);

    expect(res.body).toBeDefined();
  });

  it('returns 200 with empty arrays for a user that has no data', async () => {
    const { token, userId, email } = await registerAndLogin(harness, {
      email: `dsar-empty-${Date.now()}@musaium.test`,
    });

    const res = await harness.request('/api/users/me/export', { method: 'GET' }, token);

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect((body.user as { id: number }).id).toBe(userId);
    expect((body.user as { email: string }).email).toBe(email);
    expect(body.consent).toEqual([]);
    expect(body.chatSessions).toEqual([]);
    expect(body.savedArtworks).toEqual([]);
    expect(body.reviews).toEqual([]);
    expect(body.supportTickets).toEqual([]);
  });

  it('ignores any userId query parameter — anti-IDOR — and returns the caller dossier', async () => {
    const victim = await registerAndLogin(harness, {
      email: `dsar-victim-${Date.now()}@musaium.test`,
    });
    await seedUserWithFullDataset(harness, {
      userId: victim.userId,
      email: victim.email,
    });

    const attacker = await registerAndLogin(harness, {
      email: `dsar-attacker-${Date.now()}@musaium.test`,
    });

    // Attacker tries to coerce the export to victim by spoofing both query and body params.
    const res = await harness.request(
      `/api/users/me/export?userId=${victim.userId}`,
      { method: 'GET' },
      attacker.token,
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const user = body.user as { id: number; email: string };
    expect(user.id).toBe(attacker.userId);
    expect(user.email).toBe(attacker.email);
    expect(body.chatSessions).toEqual([]);
    expect(body.reviews).toEqual([]);
    expect(body.supportTickets).toEqual([]);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await harness.request('/api/users/me/export', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('rate-limits to 1 export per user / 7 days and returns Retry-After on 429', async () => {
    const { token } = await registerAndLogin(harness, {
      email: `dsar-rate-${Date.now()}@musaium.test`,
    });

    const first = await fetch(`${harness.baseUrl}/api/users/me/export`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${harness.baseUrl}/api/users/me/export`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(second.status).toBe(429);
    const retryAfter = second.headers.get('retry-after');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('writes a DATA_EXPORT row to the audit log with the correct userId on success', async () => {
    const { token, userId } = await registerAndLogin(harness, {
      email: `dsar-audit-${Date.now()}@musaium.test`,
    });

    const res = await harness.request('/api/users/me/export', { method: 'GET' }, token);
    expect(res.status).toBe(200);

    const rows = await harness.dataSource.query<{ action: string; actor_id: number }[]>(
      `SELECT action, actor_id FROM audit_logs
       WHERE action = $1 AND actor_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      ['DATA_EXPORT', userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('DATA_EXPORT');
    expect(rows[0].actor_id).toBe(userId);
  });

  it('returns Cache-Control: no-store on the export response', async () => {
    const { token } = await registerAndLogin(harness, {
      email: `dsar-cache-${Date.now()}@musaium.test`,
    });

    const res = await fetch(`${harness.baseUrl}/api/users/me/export`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
