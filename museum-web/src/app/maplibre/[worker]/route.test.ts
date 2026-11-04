import { describe, expect, it } from 'vitest';
import { getVersion } from 'maplibre-gl';

import { GET, generateStaticParams } from './route';

describe('GET /maplibre/maplibre-gl-worker-<version>.mjs', () => {
  it('MAP-WORKER-ROUTE · sert en JavaScript le worker de la version de maplibre-gl installée, sous un chemin qui porte cette version', async () => {
    const response = GET();

    expect(generateStaticParams()).toEqual([{ worker: `maplibre-gl-worker-${getVersion()}.mjs` }]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect((await response.text()).slice(0, 200)).toContain(`v${getVersion()}/LICENSE.txt`);
  });
});
