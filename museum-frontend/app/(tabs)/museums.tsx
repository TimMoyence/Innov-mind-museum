import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useLocation } from '@/features/museum/application/useLocation';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';
import { MuseumDirectoryList } from '@/features/museum/ui/MuseumDirectoryList';
import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';
import { ViewModeToggle } from '@/features/museum/ui/ViewModeToggle';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type ViewMode = 'list' | 'map';

/** Renders the museum directory tab screen listing nearby museums with distance. */
export default function MuseumsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { latitude, longitude, status } = useLocation();

  // When user pans the map, override GPS coords with the map center for searches.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const effectiveLat = viewMode === 'map' && mapCenter ? mapCenter.lat : latitude;
  const effectiveLng = viewMode === 'map' && mapCenter ? mapCenter.lng : longitude;

  const { museums, isLoading, searchQuery, setSearchQuery, refresh } = useMuseumDirectory(
    effectiveLat,
    effectiveLng,
  );

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'list') setMapCenter(null); // reset to GPS coords
  }, []);

  const handleMapMoved = useCallback((lat: number, lng: number) => {
    setMapCenter({ lat, lng });
  }, []);

  const handleMuseumPress = (museum: MuseumWithDistance) => {
    router.push({
      pathname: '/(stack)/museum-detail',
      params: {
        id: String(museum.id),
        name: museum.name,
        slug: museum.slug,
        address: museum.address ?? '',
        description: museum.description ?? '',
        latitude: museum.latitude !== null ? String(museum.latitude) : '',
        longitude: museum.longitude !== null ? String(museum.longitude) : '',
        distance: museum.distance !== null ? String(museum.distance) : '',
      },
    });
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <GlassCard style={styles.headerCard} intensity={60}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('museumDirectory.title')}
        </Text>
        {status === 'denied' && (
          <Text style={[styles.locationDenied, { color: theme.error }]}>
            {t('museumDirectory.location_denied')}
          </Text>
        )}
        <View style={styles.toggleRow}>
          <ViewModeToggle mode={viewMode} onToggle={handleViewModeChange} />
        </View>
      </GlassCard>

      <View style={styles.contentContainer}>
        {viewMode === 'list' ? (
          <MuseumDirectoryList
            museums={museums}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onMuseumPress={handleMuseumPress}
            onRefresh={refresh}
          />
        ) : (
          <MuseumMapView
            museums={museums}
            userLatitude={latitude}
            userLongitude={longitude}
            onMapMoved={handleMapMoved}
          />
        )}
      </View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  locationDenied: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  toggleRow: {
    marginTop: 10,
  },
  contentContainer: {
    flex: 1,
  },
});
