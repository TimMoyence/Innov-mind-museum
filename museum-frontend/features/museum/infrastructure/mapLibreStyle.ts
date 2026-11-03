import { buildRasterMapStyle } from '@musaium/shared/map';

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export const buildOsmRasterStyle = (isDark: boolean): StyleSpecification =>
  buildRasterMapStyle(isDark) as StyleSpecification;
