import { TotpRecoveryCodesSchema } from '@shared/db/jsonb-schemas/totp-recovery-codes.schema';

describe('TotpRecoveryCodesSchema', () => {
  it('accepts an empty array (pre-enrollment state)', () => {
    expect(TotpRecoveryCodesSchema.safeParse([]).success).toBe(true);
  });

  it('accepts valid entries with null consumedAt', () => {
    const valid = [
      { hash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345', consumedAt: null },
    ];
    expect(TotpRecoveryCodesSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts valid entries with ISO consumedAt timestamp', () => {
    const valid = [
      {
        hash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
        consumedAt: '2026-04-01T10:00:00.000Z',
      },
    ];
    expect(TotpRecoveryCodesSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects entry with empty hash', () => {
    const invalid = [{ hash: '', consumedAt: null }];
    expect(TotpRecoveryCodesSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects entry with non-ISO consumedAt string', () => {
    const invalid = [
      {
        hash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
        consumedAt: 'not-a-date',
      },
    ];
    expect(TotpRecoveryCodesSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects entry missing hash field', () => {
    const invalid = [{ consumedAt: null }];
    expect(TotpRecoveryCodesSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a non-array value', () => {
    expect(TotpRecoveryCodesSchema.safeParse({ hash: 'x', consumedAt: null }).success).toBe(false);
  });
});
