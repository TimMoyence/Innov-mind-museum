import { useMemo } from 'react';

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { useTheme } from '@/shared/ui/ThemeContext';

import { buildOsmRasterStyle } from '../infrastructure/mapLibreStyle';

export const useMapStyle = (): StyleSpecification => {
  const { isDark } = useTheme();
  return useMemo(() => buildOsmRasterStyle(isDark), [isDark]);
};
