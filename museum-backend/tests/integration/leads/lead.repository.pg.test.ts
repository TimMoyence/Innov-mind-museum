/**
 * T2.1 (RED — Cycle B « Aucun lead perdu » — UFR-022 fresh-context red phase).
 *
 * Pins the persistence contract of `LeadRepositoryPg` against a REAL Postgres
 * (integration-harness testcontainer), so the SQL behaviour — column shapes,
 * partial indexes, atomic `attempts++`, `DELETE … RETURNING` rowCount — is what
 * is exercised, not a hand-rolled fake.
 *
 * RED reason at baseline: the adapter
 * `src/modules/leads/adapters/secondary/pg/lead.repository.pg.ts` does NOT exist
 * yet (green phase T2.2 adds it). The import below fails to resolve → the suite
 * errors → exit ≠ 0. Foundations (entity, migration, port, factory) DO exist, so
 * the failure is precisely "no adapter impl", not a type/scaffolding gap.
 *
 * Maps: R2, R3, R8, R9, R10, R11, R15, R20.
 *
 * Test discipline (CLAUDE.md §Test Discipline) — rows are created via the
 * repo's own `insertPending()` path + `makeLeadInput()` factory; no inline
 * entity literals. Teardown via `harness.scheduleStop()` (not `.stop()`) per
 * `feedback_integration_test_teardown`.
 */
import { LeadRepositoryPg } from '@modules/leads/adapters/secondary/pg/lead.repository.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';
import { makeBetaSignupPayload } from 'tests/helpers/leads/betaSignup.fixtures';
import { makeLeadInput } from 'tests/helpers/leads/lead.fixtures';

import { Lead } from '@modules/leads/domain/lead/lead.entity';

import type { LeadDTO, LeadPayload } from '@modules/leads/domain/lead/lead.types';
import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('LeadRepositoryPg — persistence contract [integration, real PG]', () => {
  jest.setTimeout(180_000);

  let harness: IntegrationHarness;
  let repo: LeadRepositoryPg;
  let leadRepo: Repository<Lead>;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new LeadRepositoryPg(harness.dataSource);
    leadRepo = harness.dataSource.getRepository(Lead);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('insertPending (R1)', () => {
    it('persists a pending lead and returns a DTO with a generated id', async () => {
      const dto = await repo.insertPending(makeLeadInput({ type: 'beta' }));

      expect(dto.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(dto.status).toBe('pending');
      expect(dto.type).toBe('beta');
      expect(dto.attempts).toBe(0);
      expect(dto.deliveredAt).toBeNull();

      const row = await leadRepo.findOneByOrFail({ id: dto.id });
      expect(row.status).toBe('pending');
    });
  });

  describe('markDelivered (R2)', () => {
    it('transitions pending → delivered with deliveredAt and attempts incremented', async () => {
      const dto = await repo.insertPending(makeLeadInput({ type: 'beta' }));

      await repo.markDelivered(dto.id);

      const row = await leadRepo.findOneByOrFail({ id: dto.id });
      expect(row.status).toBe('delivered');
      expect(row.deliveredAt).not.toBeNull();
      expect(row.attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('markFailed (R3 / R11)', () => {
    it('transitions to failed, increments attempts, records sliced lastError (≤800)', async () => {
      const dto = await repo.insertPending(makeLeadInput({ type: 'beta' }));

      const longError = 'x'.repeat(2000);
      await repo.markFailed(dto.id, longError);

      const row = await leadRepo.findOneByOrFail({ id: dto.id });
      expect(row.status).toBe('failed');
      expect(row.attempts).toBe(1);
      expect(row.lastError).not.toBeNull();
      expect((row.lastError ?? '').length).toBeLessThanOrEqual(800);
    });

    it('increments attempts on each successive failure (R11)', async () => {
      const dto = await repo.insertPending(makeLeadInput({ type: 'beta' }));

      await repo.markFailed(dto.id, 'boom-1');
      await repo.markFailed(dto.id, 'boom-2');

      const row = await leadRepo.findOneByOrFail({ id: dto.id });
      expect(row.attempts).toBe(2);
    });
  });

  describe('selectRedeliverable (R8 / R10)', () => {
    it('returns pending/failed under maxAttempts but never delivered', async () => {
      const pending = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      const failed = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.markFailed(failed.id, 'transient');
      const delivered = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.markDelivered(delivered.id);

      const selected = await repo.selectRedeliverable(5, 100);
      const ids = selected.map((l: LeadDTO) => l.id);

      expect(ids).toContain(pending.id);
      expect(ids).toContain(failed.id);
      expect(ids).not.toContain(delivered.id);
    });

    it('does NOT select a lead at attempts >= maxAttempts (R10 terminal state)', async () => {
      const lead = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      // Drive attempts up to the cap of 2.
      await repo.markFailed(lead.id, 'e1');
      await repo.markFailed(lead.id, 'e2');

      const selected = await repo.selectRedeliverable(2, 100);
      expect(selected.map((l: LeadDTO) => l.id)).not.toContain(lead.id);
    });

    it('respects the batch limit', async () => {
      await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.insertPending(makeLeadInput({ type: 'beta' }));

      const selected = await repo.selectRedeliverable(5, 2);
      expect(selected.length).toBe(2);
    });
  });

  describe('findActiveByDedupKey (R15)', () => {
    it('finds an active pending/delivered lead by dedupKey, ignores failed', async () => {
      const activeKey = 'b2b|sales@museum.fr|louvre-lens';
      await repo.insertPending(makeLeadInput({ type: 'b2b', dedupKey: activeKey }));

      const found = await repo.findActiveByDedupKey(activeKey);
      expect(found).not.toBeNull();
      expect(found?.dedupKey).toBe(activeKey);

      // A failed lead with a distinct key must NOT be treated as active.
      const failedKey = 'b2b|other@museum.fr|other';
      const failedLead = await repo.insertPending(
        makeLeadInput({ type: 'b2b', dedupKey: failedKey }),
      );
      await repo.markFailed(failedLead.id, 'transient');

      const notActive = await repo.findActiveByDedupKey(failedKey);
      expect(notActive).toBeNull();
    });

    it('returns null when no lead carries the dedupKey', async () => {
      const found = await repo.findActiveByDedupKey('b2b|nobody@x.fr|none');
      expect(found).toBeNull();
    });
  });

  describe('purgeDeliveredOlderThan (NFR Privacy(a))', () => {
    it('hard-deletes delivered leads older than cutoff, keeps pending/failed', async () => {
      const delivered = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.markDelivered(delivered.id);
      // Backdate the delivered row well before the cutoff.
      await leadRepo.update(delivered.id, {
        deliveredAt: new Date('2020-01-01T00:00:00.000Z'),
      });

      const pending = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      const failed = await repo.insertPending(makeLeadInput({ type: 'beta' }));
      await repo.markFailed(failed.id, 'keep-me');

      const deletedCount = await repo.purgeDeliveredOlderThan(
        new Date('2026-01-01T00:00:00.000Z').toISOString(),
        100,
      );

      expect(deletedCount).toBe(1);
      expect(await leadRepo.findOneBy({ id: delivered.id })).toBeNull();
      expect(await leadRepo.findOneBy({ id: pending.id })).not.toBeNull();
      expect(await leadRepo.findOneBy({ id: failed.id })).not.toBeNull();
    });
  });

  describe('deleteByEmail (R20 — GDPR Art.17)', () => {
    it('purges every lead matching the normalised email regardless of status', async () => {
      const target = 'erase.me@example.com';
      const payloadFor = (email: string): LeadPayload =>
        makeBetaSignupPayload({ email }) as LeadPayload;

      const a = await repo.insertPending(
        makeLeadInput({ type: 'beta', payload: payloadFor(target) }),
      );
      const b = await repo.insertPending(
        makeLeadInput({ type: 'paywall', payload: payloadFor(target) }),
      );
      await repo.markDelivered(b.id);
      const other = await repo.insertPending(
        makeLeadInput({ type: 'beta', payload: payloadFor('keep@example.com') }),
      );

      const deleted = await repo.deleteByEmail(target);

      expect(deleted).toBe(2);
      expect(await leadRepo.findOneBy({ id: a.id })).toBeNull();
      expect(await leadRepo.findOneBy({ id: b.id })).toBeNull();
      expect(await leadRepo.findOneBy({ id: other.id })).not.toBeNull();
    });
  });
});
