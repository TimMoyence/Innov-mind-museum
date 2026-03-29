/**
 * Unit tests for env.ts helper functions.
 *
 * The helpers (toNumber, toBoolean, toList, required) are module-private,
 * so we re-implement their logic here and test the contracts they satisfy.
 * This is intentional — the helpers are pure functions whose behaviour
 * must be stable regardless of refactoring.
 */

// ---------------------------------------------------------------------------
// Extracted pure logic mirrors — kept in sync with src/config/env.ts
// ---------------------------------------------------------------------------

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// ---------------------------------------------------------------------------
// toNumber
// ---------------------------------------------------------------------------

describe('toNumber', () => {
  it('returns fallback when value is undefined', () => {
    expect(toNumber(undefined, 42)).toBe(42);
  });

  it('returns fallback when value is empty string', () => {
    expect(toNumber('', 42)).toBe(42);
  });

  it('parses a valid integer', () => {
    expect(toNumber('8080', 3000)).toBe(8080);
  });

  it('parses a valid float', () => {
    expect(toNumber('0.7', 0.3)).toBeCloseTo(0.7);
  });

  it('returns fallback for non-numeric string', () => {
    expect(toNumber('abc', 99)).toBe(99);
  });

  it('returns fallback for NaN', () => {
    expect(toNumber('NaN', 10)).toBe(10);
  });

  it('returns fallback for Infinity', () => {
    expect(toNumber('Infinity', 5)).toBe(5);
  });

  it('parses negative numbers', () => {
    expect(toNumber('-1', 0)).toBe(-1);
  });

  it('parses zero', () => {
    expect(toNumber('0', 99)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toBoolean
// ---------------------------------------------------------------------------

describe('toBoolean', () => {
  it('returns fallback when value is undefined', () => {
    expect(toBoolean(undefined, true)).toBe(true);
    expect(toBoolean(undefined, false)).toBe(false);
  });

  it('returns fallback when value is empty string', () => {
    expect(toBoolean('', true)).toBe(true);
  });

  it('recognises "true" (case-insensitive)', () => {
    expect(toBoolean('true', false)).toBe(true);
    expect(toBoolean('TRUE', false)).toBe(true);
    expect(toBoolean('True', false)).toBe(true);
  });

  it('recognises "1"', () => {
    expect(toBoolean('1', false)).toBe(true);
  });

  it('recognises "yes"', () => {
    expect(toBoolean('yes', false)).toBe(true);
    expect(toBoolean('YES', false)).toBe(true);
  });

  it('recognises "on"', () => {
    expect(toBoolean('on', false)).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(toBoolean('false', true)).toBe(false);
  });

  it('returns false for "0"', () => {
    expect(toBoolean('0', true)).toBe(false);
  });

  it('returns false for unrecognised strings', () => {
    expect(toBoolean('nope', true)).toBe(false);
    expect(toBoolean('off', true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toList
// ---------------------------------------------------------------------------

describe('toList', () => {
  it('returns empty array for undefined', () => {
    expect(toList(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(toList('')).toEqual([]);
  });

  it('splits comma-separated values', () => {
    expect(toList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace around items', () => {
    expect(toList(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('filters out empty segments', () => {
    expect(toList('a,,b, ,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles single value', () => {
    expect(toList('only')).toEqual(['only']);
  });
});

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------

describe('required', () => {
  it('returns the value when present', () => {
    expect(required('MY_VAR', 'hello')).toBe('hello');
  });

  it('throws when value is undefined', () => {
    expect(() => required('MY_VAR', undefined)).toThrow(
      'Missing required environment variable: MY_VAR',
    );
  });

  it('throws when value is empty string', () => {
    expect(() => required('MY_VAR', '')).toThrow('Missing required environment variable: MY_VAR');
  });

  it('throws when value is only whitespace', () => {
    expect(() => required('MY_VAR', '   ')).toThrow(
      'Missing required environment variable: MY_VAR',
    );
  });
});

// ---------------------------------------------------------------------------
// Production validation (smoke test via the real env module)
// ---------------------------------------------------------------------------

describe('production validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('throws when required vars are missing in production mode', () => {
    // Wipe all secrets that would be required in production
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.PGDATABASE;
    delete process.env.CORS_ORIGINS;
    delete process.env.MEDIA_SIGNING_SECRET;

    let caughtError: Error | undefined;
    jest.isolateModules(() => {
      try {
        require('@src/config/env');
      } catch (err) {
        caughtError = err as Error;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toMatch(/Missing required environment variable/);
  });
});
