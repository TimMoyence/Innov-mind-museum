import { parseLocationString } from '@shared/utils/location';

describe('parseLocationString', () => {
  it('parses a valid location string', () => {
    const result = parseLocationString('lat:48.8606,lng:2.3376');
    expect(result).toEqual({ lat: 48.8606, lng: 2.3376 });
  });

  it('parses negative coordinates', () => {
    const result = parseLocationString('lat:-33.8688,lng:-58.3816');
    expect(result).toEqual({ lat: -33.8688, lng: -58.3816 });
  });

  it('parses zero coordinates', () => {
    const result = parseLocationString('lat:0,lng:0');
    expect(result).toEqual({ lat: 0, lng: 0 });
  });

  it('trims whitespace', () => {
    const result = parseLocationString('  lat:48.8606,lng:2.3376  ');
    expect(result).toEqual({ lat: 48.8606, lng: 2.3376 });
  });

  it('returns null for undefined', () => {
    expect(parseLocationString(undefined)).toBeNull();
  });

  it('returns null for null-ish empty string', () => {
    expect(parseLocationString('')).toBeNull();
  });

  it('returns null for random string', () => {
    expect(parseLocationString('hello world')).toBeNull();
  });

  it('returns null for out-of-range latitude (> 90)', () => {
    expect(parseLocationString('lat:999,lng:2.3376')).toBeNull();
  });

  it('returns null for out-of-range latitude (< -90)', () => {
    expect(parseLocationString('lat:-91,lng:2.3376')).toBeNull();
  });

  it('returns null for out-of-range longitude (> 180)', () => {
    expect(parseLocationString('lat:48.86,lng:200')).toBeNull();
  });

  it('returns null for out-of-range longitude (< -180)', () => {
    expect(parseLocationString('lat:48.86,lng:-181')).toBeNull();
  });

  it('returns null for NaN values', () => {
    expect(parseLocationString('lat:NaN,lng:2.3376')).toBeNull();
  });

  it('returns null for Infinity values', () => {
    expect(parseLocationString('lat:Infinity,lng:2.3376')).toBeNull();
  });

  it('returns null for injection attempt', () => {
    expect(parseLocationString('lat:48.86,lng:2.33; DROP TABLE')).toBeNull();
  });

  it('returns null for extra fields', () => {
    expect(parseLocationString('lat:48.86,lng:2.33,alt:100')).toBeNull();
  });

  it('accepts boundary values', () => {
    expect(parseLocationString('lat:90,lng:180')).toEqual({ lat: 90, lng: 180 });
    expect(parseLocationString('lat:-90,lng:-180')).toEqual({ lat: -90, lng: -180 });
  });

  // Inputs that match the regex character class [-\d.] but produce a non-finite
  // parseFloat result. Kills the isFinite OR -> AND mutant and the
  // ConditionalExpression -> false mutant on L15.
  it('returns null when lat parses to NaN (e.g. lone "."" inside the digit class)', () => {
    expect(parseLocationString('lat:.,lng:1.0')).toBeNull();
  });

  it('returns null when lng parses to NaN (lone "." inside the digit class)', () => {
    expect(parseLocationString('lat:1.0,lng:.')).toBeNull();
  });

  // Anchored-start regex: any leading characters before "lat:" must reject.
  // Kills the Regex mutant that drops the `^` anchor on L11.
  it('rejects strings with content before the lat: prefix', () => {
    expect(parseLocationString('xlat:1.0,lng:2.0')).toBeNull();
    expect(parseLocationString(' x lat:1.0,lng:2.0')).toBeNull();
  });
});
