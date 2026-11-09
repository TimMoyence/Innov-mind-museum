const BCRYPT_ROUNDS_FLOOR = 12;

function withFloorAssert(rounds: number): number {
  if (rounds < BCRYPT_ROUNDS_FLOOR) {
    throw new Error(
      `BCRYPT_ROUNDS (${String(rounds)}) is below the OWASP 2026 floor (${String(BCRYPT_ROUNDS_FLOOR)}). Refusing to boot.`,
    );
  }
  return rounds;
}

export const BCRYPT_ROUNDS = withFloorAssert(12);
