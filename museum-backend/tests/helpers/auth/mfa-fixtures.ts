import bcrypt from 'bcrypt';

import { TotpSecret, type TotpRecoveryCode } from '@modules/auth/domain/totp/totp-secret.entity';
import { encryptTotpSecret } from '@modules/auth/useCase/totp/totpEncryption';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

/**
 * Build a {@link TotpSecret} entity with sensible defaults. Override any field
 * to drill into a specific scenario (enrolled, never-used, used-once, etc.).
 * @param overrides
 */
export const makeTotpSecret = (overrides: Partial<TotpSecret> = {}): TotpSecret =>
  ({
    id: 1,
    userId: 1,
    secretEncrypted: encryptTotpSecret('JBSWY3DPEHPK3PXP'),
    enrolledAt: new Date('2026-04-01T00:00:00Z'),
    lastUsedAt: null,
    recoveryCodes: [],
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  }) as unknown as TotpSecret;

/**
 * Generate `count` plain recovery codes + their bcrypt-hashed persistence
 * shape. Returns both so tests can assert on a known plaintext while the
 * repository row carries the production-shape hashes.
 *
 * Bcrypt cost is intentionally lowered (4) — these fixtures never run under
 * CI where production-grade cost would dwarf test runtime by 10×. The cost
 * has zero security relevance inside an in-memory test.
 * @param count
 */
export const makeRecoveryCodes = async (
  count: number,
): Promise<{ plain: string[]; persisted: TotpRecoveryCode[] }> => {
  const plain: string[] = [];
  for (let i = 0; i < count; i += 1) {
    plain.push(`TEST${String(i).padStart(2, '0')}-CODE${String(i).padStart(2, '0')}`);
  }
  const persisted: TotpRecoveryCode[] = await Promise.all(
    plain.map(async (code) => ({
      hash: await bcrypt.hash(code, 4),
      consumedAt: null,
    })),
  );
  return { plain, persisted };
};

/**
 * In-memory implementation of {@link ITotpSecretRepository} for unit tests.
 * Exposed as a class so tests can inspect the internal map for assertions.
 */
export class InMemoryTotpSecretRepository implements ITotpSecretRepository {
  rows = new Map<number, TotpSecret>();

  async findByUserId(userId: number): Promise<TotpSecret | null> {
    return this.rows.get(userId) ?? null;
  }

  async upsertEnrollment(input: {
    userId: number;
    secretEncrypted: string;
    recoveryCodes: TotpRecoveryCode[];
  }): Promise<TotpSecret> {
    const existing = this.rows.get(input.userId);
    const next = makeTotpSecret({
      id: existing?.id ?? input.userId,
      userId: input.userId,
      secretEncrypted: input.secretEncrypted,
      recoveryCodes: input.recoveryCodes,
      enrolledAt: null,
      lastUsedAt: null,
    });
    this.rows.set(input.userId, next);
    return next;
  }

  async markEnrolled(userId: number, at: Date): Promise<void> {
    const row = this.rows.get(userId);
    if (!row) return;
    if (row.enrolledAt == null) {
      row.enrolledAt = at;
      row.lastUsedAt = at;
    }
  }

  async markUsed(userId: number, at: Date): Promise<void> {
    const row = this.rows.get(userId);
    if (!row) return;
    row.lastUsedAt = at;
  }

  async updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void> {
    const row = this.rows.get(userId);
    if (!row) return;
    row.recoveryCodes = codes;
  }

  async deleteByUserId(userId: number): Promise<void> {
    this.rows.delete(userId);
  }
}
