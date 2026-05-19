/**
 * R2 acceptance — `buildPinningOptions().[PINNED_HOST].expirationDate`.
 *
 * Cited:
 *   - lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md:48-52
 *     (PinningOptions option table — `expirationDate?: string`, yyyy-MM-dd)
 *   - lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md:154-156
 *     (§5.4 — `expirationDate` is a failsafe pinned at E8 NotAfter)
 *
 * Bounds (spec NFR R2):
 *   - >= 2027-03-12 (E8 intermediate NotAfter)
 *   - <= 2028-03-12 (E8 NotAfter + 12 months cap; bounds the silent-unpin window)
 *
 * Bounds are checked via `Date.parse(...)` against the literal boundary
 * dates rather than against the green-phase const value (R2 NFR: avoid
 * coupling tests to the green-phase const beyond the bounds).
 */
import {
  buildPinningOptions,
  PINNED_HOST,
  PINSET_EXPIRATION_DATE,
  PROD_SPKI_HASHES,
} from '@/shared/config/cert-pinning';

const LOWER_BOUND_MS = Date.parse('2027-03-12');
const UPPER_BOUND_MS = Date.parse('2028-03-12');

describe('buildPinningOptions — expirationDate failsafe (R2)', () => {
  it('emits an expirationDate string in yyyy-MM-dd format for the PINNED_HOST entry', () => {
    const options = buildPinningOptions();
    const entry = options[PINNED_HOST];
    if (!entry) throw new Error('expected PinningOptions entry for PINNED_HOST');
    expect(entry).toBeDefined();
    expect(typeof entry.expirationDate).toBe('string');
    expect(entry.expirationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses to a timestamp ≥ E8 NotAfter (2027-03-12)', () => {
    const options = buildPinningOptions();
    const entry = options[PINNED_HOST];
    if (!entry) throw new Error('expected PinningOptions entry for PINNED_HOST');
    const value = entry.expirationDate;
    if (!value) throw new Error('expected expirationDate string on PINNED_HOST entry');
    expect(typeof value).toBe('string');
    const ts = Date.parse(value);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(LOWER_BOUND_MS);
  });

  it('parses to a timestamp ≤ E8 NotAfter + 12 months cap (2028-03-12)', () => {
    const options = buildPinningOptions();
    const entry = options[PINNED_HOST];
    if (!entry) throw new Error('expected PinningOptions entry for PINNED_HOST');
    const value = entry.expirationDate;
    if (!value) throw new Error('expected expirationDate string on PINNED_HOST entry');
    expect(typeof value).toBe('string');
    const ts = Date.parse(value);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeLessThanOrEqual(UPPER_BOUND_MS);
  });

  it('exports PINSET_EXPIRATION_DATE as a literal const matching the per-host expirationDate', () => {
    // Sanity / single source of truth — PINSET_EXPIRATION_DATE is the
    // canonical export the runbook references when rotating pins.
    expect(typeof PINSET_EXPIRATION_DATE).toBe('string');
    expect(PINSET_EXPIRATION_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const options = buildPinningOptions();
    const entry = options[PINNED_HOST];
    if (!entry) throw new Error('expected PinningOptions entry for PINNED_HOST');
    expect(entry.expirationDate).toBe(PINSET_EXPIRATION_DATE);
  });

  it('preserves publicKeyHashes when a custom hashes array is passed', () => {
    // Defensive parity check — adding `expirationDate` must not regress
    // the existing publicKeyHashes pass-through behavior of the factory.
    const custom = ['hash-a', 'hash-b'] as const;
    const options = buildPinningOptions(custom);
    const entry = options[PINNED_HOST];
    if (!entry) throw new Error('expected PinningOptions entry for PINNED_HOST');
    expect(entry.publicKeyHashes).toEqual(['hash-a', 'hash-b']);
    // Default-arg path also intact.
    const defaults = buildPinningOptions();
    const defaultEntry = defaults[PINNED_HOST];
    if (!defaultEntry) throw new Error('expected default PinningOptions entry for PINNED_HOST');
    expect(defaultEntry.publicKeyHashes).toEqual([...PROD_SPKI_HASHES]);
  });
});
