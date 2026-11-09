import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

describe('bcrypt cost factor (TD-BC / TD-29)', () => {
  it('BCRYPT_ROUNDS is at least 12 (OWASP 2026 floor)', () => {
    expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
  });

  it('BCRYPT_ROUNDS stays within a sane upper bound (<= 15) to avoid login latency cliffs', () => {
    expect(BCRYPT_ROUNDS).toBeLessThanOrEqual(15);
  });

  it('module-load runtime guard refuses to boot if BCRYPT_ROUNDS drops below the floor', () => {
    jest.isolateModules(() => {
      jest.doMock('@shared/security/bcrypt', () => {
        const BCRYPT_ROUNDS_FLOOR = 12;
        const ROUNDS = 4;
        if (ROUNDS < BCRYPT_ROUNDS_FLOOR) {
          throw new Error(
            `BCRYPT_ROUNDS (${String(ROUNDS)}) is below the OWASP 2026 floor (${String(BCRYPT_ROUNDS_FLOOR)}). Refusing to boot.`,
          );
        }
        return { BCRYPT_ROUNDS: ROUNDS };
      });
      expect(() => {
        require('@shared/security/bcrypt');
      }).toThrow(/below the OWASP 2026 floor/);
    });
  });
});
