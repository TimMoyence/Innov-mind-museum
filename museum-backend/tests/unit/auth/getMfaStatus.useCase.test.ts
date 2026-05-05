import { GetMfaStatusUseCase } from '@modules/auth/useCase/totp/getMfaStatus.useCase';

import { InMemoryTotpSecretRepository, makeTotpSecret } from '../../helpers/auth/mfa-fixtures';

describe('GetMfaStatusUseCase (F9)', () => {
  let repo: InMemoryTotpSecretRepository;
  let useCase: GetMfaStatusUseCase;

  beforeEach(() => {
    repo = new InMemoryTotpSecretRepository();
    useCase = new GetMfaStatusUseCase(repo);
  });

  it('returns mfaEnrolled=false when the user has never enrolled', async () => {
    const result = await useCase.execute(42);
    expect(result).toEqual({ mfaEnrolled: false, methods: [], lastVerifiedAt: null });
  });

  it('returns mfaEnrolled=false when the row exists but enrollment never confirmed', async () => {
    repo.rows.set(42, makeTotpSecret({ id: 1, userId: 42, enrolledAt: null, lastUsedAt: null }));

    const result = await useCase.execute(42);

    expect(result.mfaEnrolled).toBe(false);
    expect(result.methods).toEqual([]);
    expect(result.lastVerifiedAt).toBeNull();
  });

  it('returns enrolledAt as lastVerifiedAt when verification has never happened post-enrollment', async () => {
    const enrolledAt = new Date('2026-04-15T10:00:00Z');
    repo.rows.set(42, makeTotpSecret({ id: 1, userId: 42, enrolledAt, lastUsedAt: null }));

    const result = await useCase.execute(42);

    expect(result.mfaEnrolled).toBe(true);
    expect(result.methods).toEqual(['totp']);
    expect(result.lastVerifiedAt).toBe(enrolledAt.toISOString());
  });

  it('prefers lastUsedAt over enrolledAt when both are set', async () => {
    const enrolledAt = new Date('2026-04-15T10:00:00Z');
    const lastUsedAt = new Date('2026-05-01T08:30:00Z');
    repo.rows.set(42, makeTotpSecret({ id: 1, userId: 42, enrolledAt, lastUsedAt }));

    const result = await useCase.execute(42);

    expect(result.lastVerifiedAt).toBe(lastUsedAt.toISOString());
  });

  it('does not leak the encrypted secret in the envelope', async () => {
    repo.rows.set(
      42,
      makeTotpSecret({
        id: 1,
        userId: 42,
        enrolledAt: new Date(),
        secretEncrypted: 'sentinel-must-not-leak',
      }),
    );

    const result = await useCase.execute(42);

    expect(JSON.stringify(result)).not.toContain('sentinel-must-not-leak');
    expect(JSON.stringify(result)).not.toContain('secretEncrypted');
  });
});
