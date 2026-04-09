import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { semantic } from '@/shared/ui/tokens.semantic';
import { fontSize } from '@/shared/ui/tokens.generated';

type ViewMode = 'list' | 'map';

const FADE_DURATION_MS = 180;

/** Renders the museum directory tab screen listing nearby museums with distance. */
export default function MuseumsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { latitude, longitude, status } = useLocation();

  // When user pans the map, override GPS coords with the map center for searches.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Crossfade animation for view mode transitions.
  // eslint-disable-next-line react-hooks/refs -- Animated.Value created once, persisted via useRef
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const effectiveLat = viewMode === 'map' && mapCenter ? mapCenter.lat : latitude;
  const effectiveLng = viewMode === 'map' && mapCenter ? mapCenter.lng : longitude;

  const { museums, isLoading, searchQuery, setSearchQuery, refresh } = useMuseumDirectory(
    effectiveLat,
    effectiveLng,
  );

  // Live region: announce result count changes via VoiceOver/TalkBack.
  // Skips the initial loading phase to avoid empty announcements.
  const previousCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const count = museums.length;
    if (previousCountRef.current === null) {
      previousCountRef.current = count;
      return;
    }
    if (previousCountRef.current !== count) {
      previousCountRef.current = count;
      AccessibilityInfo.announceForAccessibility(t('a11y.museum.results_count', { count }));
    }
  }, [museums, isLoading, t]);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      if (mode === viewMode) return;
      // Crossfade: fade out → switch mode → fade in.
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setViewMode(mode);
        if (mode === 'list') setMapCenter(null); // reset to GPS coords
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    },
    [viewMode, fadeAnim],
  );

  const handleMapMoved = useCallback((lat: number, lng: number) => {
    setMapCenter({ lat, lng });
  }, []);

  const handleResetMapCenter = useCallback(() => {
    setMapCenter(null);
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

  const showSearchAreaChip = viewMode === 'map' && mapCenter !== null;

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <GlassCard style={styles.headerCard} intensity={60}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('museumDirectory.title')}
        </Text>
        {status === 'denied' && (
          <Text
            style={[styles.locationDenied, { color: theme.error }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {t('museumDirectory.location_denied')}
          </Text>
        )}
        <View style={styles.toggleRow}>
          <ViewModeToggle mode={viewMode} onToggle={handleViewModeChange} />
        </View>
      </GlassCard>

      <Animated.View style={[styles.contentContainer, { opacity: fadeAnim }]}>
        {showSearchAreaChip ? (
          <Pressable
            style={[
              styles.searchAreaChip,
              { backgroundColor: theme.primary + '1A', borderColor: theme.primary },
            ]}
            onPress={handleResetMapCenter}
            accessibilityRole="button"
            accessibilityLabel={t('museumDirectory.search_this_area')}
          >
            <Ionicons name="locate-outline" size={14} color={theme.primary} />
            <Text style={[styles.searchAreaText, { color: theme.primary }]}>
              {t('museumDirectory.search_this_area')}
            </Text>
            <Ionicons name="close" size={14} color={theme.primary} />
          </Pressable>
        ) : null}
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
      </Animated.View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
  },
  headerCard: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.padding,
    alignItems: 'center',
    marginBottom: semantic.card.gap,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  locationDenied: {
    marginTop: semantic.section.gapTight,
    fontSize: semantic.card.captionSize,
    fontWeight: '600',
  },
  toggleRow: {
    marginTop: semantic.form.gap,
  },
  contentContainer: {
    flex: 1,
  },
  searchAreaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: semantic.section.gapTight,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.section.gapTight,
    borderRadius: semantic.modal.radius,
    borderWidth: 1,
    marginBottom: semantic.form.gap,
  },
  searchAreaText: {
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
  },
});
