import { detectMuseumQuerySchema } from '@modules/museum/adapters/primary/http/schemas/museum.schemas';

describe('detectMuseumQuerySchema', () => {
  it('parses valid lat/lng strings (query params come in as strings)', () => {
    const parsed = detectMuseumQuerySchema.parse({ lat: '48.86', lng: '2.34' });
    expect(parsed).toEqual({ lat: 48.86, lng: 2.34 });
  });

  it('parses valid lat/lng numbers', () => {
    const parsed = detectMuseumQuerySchema.parse({ lat: -33.87, lng: 151.21 });
    expect(parsed).toEqual({ lat: -33.87, lng: 151.21 });
  });

  it('rejects missing lat', () => {
    expect(() => detectMuseumQuerySchema.parse({ lng: 2.34 })).toThrow();
  });

  it('rejects missing lng', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: 48.86 })).toThrow();
  });

  it('rejects NaN lat', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: 'not-a-number', lng: 2.34 })).toThrow();
  });

  it('rejects lat out of range (> 90)', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: 91, lng: 2.34 })).toThrow();
  });

  it('rejects lat out of range (< -90)', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: -90.1, lng: 2.34 })).toThrow();
  });

  it('rejects lng out of range (> 180)', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: 48.86, lng: 181 })).toThrow();
  });

  it('rejects lng out of range (< -180)', () => {
    expect(() => detectMuseumQuerySchema.parse({ lat: 48.86, lng: -180.1 })).toThrow();
  });
});
