/**
 * E2E: registration must persist a `user_consents` row with scope
 * `tos_privacy` at the current POLICY_VERSION. Closes the GDPR consent
 * gap flagged by the 2026-04-26 audit — before this change, the FE
 * checkbox blocked submission client-side but no server-side proof
 * survived past the HTTP response.
 *
 * Cf docs/audit-cleanup-2026-05-12/PROGRESS_A.md A.2 / A.8
 */
import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import { POLICY_VERSION } from '@shared/legal/policy-version';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('registration consent (GDPR)', () => {
  jest.setTimeout(120_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('creates a user_consents row with scope=tos_privacy on registration', async () => {
    const email = `e2e-consent-${Date.now()}@musaium.test`;
    const res = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Consent',
        lastname: 'Test',
      }),
    });

    expect(res.status).toBe(201);
    const userId = (res.body as { user: { id: number } }).user.id;

    const rows = await harness.dataSource.query<
      { scope: string; version: string; source: string; revoked_at: Date | null }[]
    >(
      `SELECT scope, version, source, revoked_at FROM user_consents WHERE user_id = $1`,
      [userId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        scope: 'tos_privacy',
        version: POLICY_VERSION,
        source: 'registration',
        revoked_at: null,
      }),
    );
  });

  it('rejects registration with dateOfBirth < 15 years and emits no user_consents row', async () => {
    // Build a DOB exactly 14 years before now, in YYYY-MM-DD.
    const today = new Date();
    const fourteenYearsAgo = new Date(
      today.getUTCFullYear() - 14,
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const dateOfBirth = fourteenYearsAgo.toISOString().slice(0, 10);

    const email = `e2e-minor-${Date.now()}@musaium.test`;
    const res = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Minor',
        lastname: 'Test',
        dateOfBirth,
      }),
    });

    expect(res.status).toBe(422);
    expect((res.body as { code?: string }).code).toBe('MINOR_PARENTAL_CONSENT_REQUIRED');

    const rows = await harness.dataSource.query<{ id: number }[]>(
      `SELECT uc.id FROM user_consents uc
       JOIN users u ON u.id = uc.user_id
       WHERE u.email = $1`,
      [email],
    );
    expect(rows).toHaveLength(0);
  });

  it('accepts registration with dateOfBirth ≥ 15 years and persists DOB', async () => {
    const today = new Date();
    const eighteenYearsAgo = new Date(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    );
    const dateOfBirth = eighteenYearsAgo.toISOString().slice(0, 10);

    const email = `e2e-adult-${Date.now()}@musaium.test`;
    const res = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Adult',
        lastname: 'Test',
        dateOfBirth,
      }),
    });

    expect(res.status).toBe(201);
    const userId = (res.body as { user: { id: number } }).user.id;

    const rows = await harness.dataSource.query<{ date_of_birth: string | Date | null }[]>(
      `SELECT date_of_birth FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date_of_birth).not.toBeNull();
  });
});
