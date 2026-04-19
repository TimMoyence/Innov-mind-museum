import { useMemo } from 'react';

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { useTheme } from '@/shared/ui/ThemeContext';

import { buildOsmRasterStyle } from '../infrastructure/mapLibreStyle';

/**
 * Returns the MapLibre style specification for the museum map, switching
 * between Positron (light) and Dark Matter (dark) based on the app theme.
 * Encapsulates the infrastructure import so UI components stay layer-clean.
 */
export const useMapStyle = (): StyleSpecification => {
  const { isDark } = useTheme();
  return useMemo(() => buildOsmRasterStyle(isDark), [isDark]);
};
