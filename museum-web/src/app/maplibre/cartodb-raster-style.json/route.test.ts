import { describe, expect, it } from 'vitest';
import { buildRasterMapStyle } from '@musaium/shared/map';

import { GET } from './route';

describe('GET /maplibre/cartodb-raster-style.json', () => {
  it('serves the shared light raster style the mobile offline packs download', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(buildRasterMapStyle(false));
  });
});
