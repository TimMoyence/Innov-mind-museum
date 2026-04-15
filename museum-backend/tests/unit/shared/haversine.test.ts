import { haversineDistanceMeters } from '@shared/utils/haversine';

describe('haversineDistanceMeters', () => {
  it('returns approximately 392km for Paris to Lyon', () => {
    const distance = haversineDistanceMeters(48.8566, 2.3522, 45.764, 4.8357);
    // Paris to Lyon is approximately 392km
    expect(distance).toBeGreaterThan(390_000);
    expect(distance).toBeLessThan(395_000);
  });

  it('returns 0 for the same point', () => {
    const distance = haversineDistanceMeters(48.8566, 2.3522, 48.8566, 2.3522);
    expect(distance).toBe(0);
  });

  it('returns approximately 20015km for antipodal points', () => {
    // North Pole to South Pole
    const distance = haversineDistanceMeters(90, 0, -90, 0);
    // Half circumference of Earth ~ 20015km
    expect(distance).toBeGreaterThan(20_000_000);
    expect(distance).toBeLessThan(20_030_000);
  });

  it('returns a short distance for nearby points', () => {
    // Two points ~111m apart (0.001 degrees latitude at equator)
    const distance = haversineDistanceMeters(0, 0, 0.001, 0);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it('handles negative coordinates', () => {
    // Sydney to Buenos Aires (both in southern hemisphere)
    const distance = haversineDistanceMeters(-33.8688, 151.2093, -34.6037, -58.3816);
    // Approximately 11,800km
    expect(distance).toBeGreaterThan(11_500_000);
    expect(distance).toBeLessThan(12_200_000);
  });

  it('is symmetric', () => {
    const d1 = haversineDistanceMeters(48.8566, 2.3522, 45.764, 4.8357);
    const d2 = haversineDistanceMeters(45.764, 4.8357, 48.8566, 2.3522);
    expect(d1).toBeCloseTo(d2, 6);
  });
});
