import { toIsoTimestamp } from '@src/config/env-helpers';

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

describe('toIsoTimestamp', () => {
  const FALLBACK = '2026-05-27T00:00:00.000Z';
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns the fallback when value is undefined', () => {
    expect(toIsoTimestamp(undefined, FALLBACK)).toBe(FALLBACK);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns the fallback when value is empty / whitespace', () => {
    expect(toIsoTimestamp('', FALLBACK)).toBe(FALLBACK);
    expect(toIsoTimestamp('   ', FALLBACK)).toBe(FALLBACK);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('normalises a valid ISO string to a UTC ISO string', () => {
    expect(toIsoTimestamp('2026-01-01T00:00:00Z', FALLBACK)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('normalises an offset timestamp to UTC', () => {
    expect(toIsoTimestamp('2026-06-01T02:00:00+02:00', FALLBACK)).toBe('2026-06-01T00:00:00.000Z');
  });

  it('degrades to the fallback and warns on an unparseable value', () => {
    expect(toIsoTimestamp('not-a-date', FALLBACK)).toBe(FALLBACK);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const written = String(stderrSpy.mock.calls[0][0]);
    expect(written).toContain('env_iso_timestamp_invalid');
    expect(written).toContain('not-a-date');
  });
});

describe('production validation via required()', () => {
  it('required() enforces non-empty string (used in prod validation block)', () => {
    expect(() => required('JWT_ACCESS_SECRET', undefined)).toThrow(/Missing required/);
    expect(() => required('JWT_ACCESS_SECRET', '')).toThrow(/Missing required/);
    expect(() => required('JWT_ACCESS_SECRET', '  ')).toThrow(/Missing required/);
    expect(required('JWT_ACCESS_SECRET', 'my-secret')).toBe('my-secret');
  });
});
