import { buildRasterMapStyle } from '@musaium/shared/map';

import { buildOsmRasterStyle } from '@/features/museum/infrastructure/mapLibreStyle';
import { OFFLINE_STYLE_URL } from '@/features/museum/infrastructure/mapStyleUrl';

describe('RAZ-M9-MAPSTYLE', () => {
  it('RAZ-M9-MAPSTYLE · le pack hors ligne télécharge le style servi par musaium.com, pas par GitHub Pages', () => {
    const url = new URL(OFFLINE_STYLE_URL);

    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('musaium.com');
    expect(url.pathname).toBe('/maplibre/cartodb-raster-style.json');
  });

  it('RAZ-M9-MAPSTYLE · la carte en ligne utilise exactement le style de la source partagée', () => {
    expect(buildOsmRasterStyle(false)).toEqual(buildRasterMapStyle(false));
    expect(buildOsmRasterStyle(true)).toEqual(buildRasterMapStyle(true));
    expect(buildRasterMapStyle(true)).not.toEqual(buildRasterMapStyle(false));
  });
});
