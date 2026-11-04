import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const setWorkerUrl = vi.fn();
const mapConstructor = vi.fn();

vi.mock('maplibre-gl', () => ({
  getVersion: () => '9.9.9',
  setWorkerUrl: (url: string) => {
    setWorkerUrl(url);
  },
  Map: class {
    constructor(options: unknown) {
      mapConstructor(options);
    }
    on() {
      return this;
    }
    remove() {
      return undefined;
    }
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('MAP-WORKER-URL', () => {
  it('MAP-WORKER-URL · la carte de démo déclare le worker same-origin versionné avant de créer la carte', async () => {
    const { default: DemoMap } = await import('@/components/marketing/DemoMap');

    render(<DemoMap />);

    expect(setWorkerUrl).toHaveBeenCalledWith('/maplibre/maplibre-gl-worker-9.9.9.mjs');
    expect(mapConstructor).toHaveBeenCalledTimes(1);
    expect(setWorkerUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mapConstructor.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
