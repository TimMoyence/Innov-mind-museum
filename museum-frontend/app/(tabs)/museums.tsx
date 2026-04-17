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

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useLocation } from '@/features/museum/application/useLocation';
import { openInNativeMaps } from '@/features/museum/application/openInNativeMaps';
import type { MuseumWithDistance } from '@/features/museum/application/useMuseumDirectory';
import { useMuseumDirectory } from '@/features/museum/application/useMuseumDirectory';
import { MuseumDirectoryList } from '@/features/museum/ui/MuseumDirectoryList';
import { MuseumMapView } from '@/features/museum/ui/MuseumMapView';
import { MuseumSheet } from '@/features/museum/ui/MuseumSheet';
import { ViewModeToggle } from '@/features/museum/ui/ViewModeToggle';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, fontSize } from '@/shared/ui/tokens';

type ViewMode = 'list' | 'map';

const FADE_DURATION_MS = 180;

/** Renders the museum directory tab screen listing nearby museums with distance. */
export default function MuseumsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { latitude, longitude, status } = useLocation();

  // Last visible map bbox — set on every drag, consumed by the "search in this area" chip.
  const [mapBbox, setMapBbox] = useState<[number, number, number, number] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedMuseum, setSelectedMuseum] = useState<MuseumWithDistance | null>(null);
  const reduceMotion = useReducedMotion();
  const { isCreating: isStartingChat, startConversation } = useStartConversation();

  // Crossfade animation for view mode transitions.
  // eslint-disable-next-line react-hooks/refs -- Animated.Value created once, persisted via useRef
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { museums, isLoading, searchQuery, setSearchQuery, refresh, searchInBounds } =
    useMuseumDirectory(latitude, longitude);

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
      if (reduceMotion) {
        // WCAG 2.3.3: instant switch, no crossfade animation.
        fadeAnim.setValue(1);
        setViewMode(mode);
        if (mode === 'list') setMapBbox(null);
        return;
      }
      // Crossfade: fade out → switch mode → fade in.
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setViewMode(mode);
        if (mode === 'list') setMapBbox(null);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    },
    [viewMode, fadeAnim, reduceMotion],
  );

  const handleMapMoved = useCallback(
    (_lat: number, _lng: number, bbox: [number, number, number, number]) => {
      setMapBbox(bbox);
    },
    [],
  );

  const handleSearchInVisibleArea = useCallback(() => {
    if (mapBbox) {
      searchInBounds(mapBbox);
    }
  }, [mapBbox, searchInBounds]);

  const handleMuseumPress = (museum: MuseumWithDistance) => {
    setSelectedMuseum(museum);
  };

  const handleSheetClose = useCallback(() => {
    setSelectedMuseum(null);
  }, []);

  const handleStartChat = useCallback(
    (museum: MuseumWithDistance) => {
      const coordinates =
        museum.latitude != null && museum.longitude != null
          ? { lat: museum.latitude, lng: museum.longitude }
          : undefined;
      setSelectedMuseum(null);
      void startConversation({
        museumMode: true,
        museumId: museum.id > 0 ? museum.id : undefined,
        museumName: museum.name,
        museumAddress: museum.address ?? undefined,
        coordinates,
        skipSettings: true,
      });
    },
    [startConversation],
  );

  const handleOpenInMaps = useCallback((museum: MuseumWithDistance) => {
    openInNativeMaps({
      latitude: museum.latitude,
      longitude: museum.longitude,
      name: museum.name,
    });
  }, []);

  const handleViewDetails = useCallback((museum: MuseumWithDistance) => {
    setSelectedMuseum(null);
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
        distanceMeters: museum.distanceMeters !== null ? String(museum.distanceMeters) : '',
      },
    });
  }, []);

  const showSearchAreaChip = viewMode === 'map' && mapBbox !== null;

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
            onPress={handleSearchInVisibleArea}
            accessibilityRole="button"
            accessibilityLabel={t('museumDirectory.search_this_area')}
          >
            <Ionicons name="locate-outline" size={14} color={theme.primary} />
            <Text style={[styles.searchAreaText, { color: theme.primary }]}>
              {t('museumDirectory.search_this_area')}
            </Text>
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
            onMuseumSelect={setSelectedMuseum}
          />
        )}
      </Animated.View>

      <MuseumSheet
        museum={selectedMuseum}
        isStartingChat={isStartingChat}
        onClose={handleSheetClose}
        onStartChat={handleStartChat}
        onOpenInMaps={handleOpenInMaps}
        onViewDetails={handleViewDetails}
      />
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
