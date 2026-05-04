import { renderHook } from '@testing-library/react-native';

import { useMuseumCollection } from '@/features/museum/application/useMuseumCollection';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';

import { makeMuseumWithDistance as makeMuseum } from '../../helpers/factories/museum.factories';

describe('useMuseumCollection', () => {
  it('returns a FeatureCollection whose feature count equals the museum count when all coords are valid', () => {
    const museums: MuseumWithDistance[] = [
      makeMuseum({ latitude: 48.8566, longitude: 2.3522 }),
      makeMuseum({ latitude: 43.2965, longitude: 5.3698 }),
    ];
    const { result } = renderHook(
      ({ data }: { data: MuseumWithDistance[] }) => useMuseumCollection(data),
      { initialProps: { data: museums } },
    );

    expect(result.current.type).toBe('FeatureCollection');
    expect(result.current.features).toHaveLength(2);
  });

  it('returns referentially equal output across renders with the same museums reference', () => {
    const museums: MuseumWithDistance[] = [makeMuseum({ latitude: 48.8566, longitude: 2.3522 })];
    const { result, rerender } = renderHook(
      ({ data }: { data: MuseumWithDistance[] }) => useMuseumCollection(data),
      { initialProps: { data: museums } },
    );
    const first = result.current;
    rerender({ data: museums });
    expect(result.current).toBe(first);
  });

  it('returns a new FeatureCollection identity after the museums array reference changes', () => {
    const initial: MuseumWithDistance[] = [makeMuseum({ latitude: 48.8566, longitude: 2.3522 })];
    const next: MuseumWithDistance[] = [makeMuseum({ latitude: 43.2965, longitude: 5.3698 })];
    const { result, rerender } = renderHook(
      ({ data }: { data: MuseumWithDistance[] }) => useMuseumCollection(data),
      { initialProps: { data: initial } },
    );
    const first = result.current;
    rerender({ data: next });
    expect(result.current).not.toBe(first);
  });

  it('drops museums with null latitude or null longitude (delegates to buildMuseumFeatureCollection)', () => {
    const museums: MuseumWithDistance[] = [
      makeMuseum({ latitude: 48.8566, longitude: 2.3522 }),
      makeMuseum({ latitude: null, longitude: 2.3522 }),
      makeMuseum({ latitude: 48.8566, longitude: null }),
      makeMuseum({ latitude: null, longitude: null }),
    ];
    const { result } = renderHook(() => useMuseumCollection(museums));
    expect(result.current.features).toHaveLength(1);
  });
});
