import {
  Camera,
  type CameraRef,
  Map,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { GeoJSONSourceRef } from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PerfOverlay } from '@/features/diagnostics/PerfOverlay';
import { perfStore } from '@/features/diagnostics/perfStore';
import { reportError } from '@/shared/observability/errorReporting';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

import type { MuseumFeatureProperties } from '../application/buildMuseumFeatureCollection';
import { computeMuseumMapFitTarget, FIT_PADDING } from '../application/computeMuseumMapFitTarget';
import { useMapInitialViewState } from '../application/useMapInitialViewState';
import { useMapStyle } from '../application/useMapStyle';
import { useMuseumCollection } from '../application/useMuseumCollection';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { useNearestCity } from '../application/useNearestCity';
import { useOfflinePackPromptTrigger } from '../application/useOfflinePackPromptTrigger';
import { mapCameraCache } from '../infrastructure/mapCameraCache';
import { museumMapViewStyles as styles } from './museumMapView.styles';
import { MuseumMapMarkers } from './MuseumMapMarkers';
import { MuseumMapStatusOverlay } from './MuseumMapStatusOverlay';
import { OfflinePackPrompt } from './OfflinePackPrompt';

interface MuseumMapViewProps {
  museums: MuseumWithDistance[];
  userLatitude: number | null;
  userLongitude: number | null;
  /**
   * Fired after the user pans the map. The `bbox` corresponds to the new
   * visible area as `[minLng, minLat, maxLng, maxLat]` and is used by the
   * "search in this area" button to query museums inside the viewport.
   */
  onMapMoved?: (lat: number, lng: number, bbox: [number, number, number, number]) => void;
  onMuseumSelect?: (museum: MuseumWithDistance) => void;
}

interface ClusterProperties {
  cluster: true;
  cluster_id: number;
  point_count: number;
  point_count_abbreviated: string;
}

type PressedProperties = ClusterProperties | MuseumFeatureProperties;

const isClusterProperties = (props: PressedProperties | null): props is ClusterProperties =>
  props !== null && 'cluster' in props;

const CLUSTER_EXPAND_ZOOM_FALLBACK = 16;
const CLUSTER_EXPAND_DURATION_MS = 450;
const FIT_DURATION_MS = 600;

const userPositionToCollection = (lat: number, lng: number): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {},
    },
  ],
});

/**
 * Renders an interactive MapLibre Native map with museum markers and the
 * user's current position. Tiles are OSM/CartoDB raster so offline packs
 * created via `OfflineManager.createPack` cache the same imagery the app
 * displays online.
 *
 * The component preserves the legacy Leaflet prop contract so
 * `app/(tabs)/museums.tsx` integration does not change.
 */
export const MuseumMapView = ({
  museums,
  userLatitude,
  userLongitude,
  onMapMoved,
  onMuseumSelect,
}: MuseumMapViewProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const museumsSourceRef = useRef<GeoJSONSourceRef>(null);
  const userPannedRef = useRef(false);
  const hasFittedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const [hasLoadError, setHasLoadError] = useState(false);

  const nearestCity = useNearestCity(museums);
  const offlinePrompt = useOfflinePackPromptTrigger(nearestCity);

  const mapStyle = useMapStyle();
  const museumCollection = useMuseumCollection(museums);
  const userCollection = useMemo(
    () =>
      userLatitude !== null && userLongitude !== null
        ? userPositionToCollection(userLatitude, userLongitude)
        : null,
    [userLatitude, userLongitude],
  );

  // Camera starts on the previously persisted view (last explicit user pan)
  // when available, otherwise GPS, otherwise a world-centered default. The Map
  // is rendered only after this resolves so we never paint the wrong region
  // first and then jump.
  const initialViewState = useMapInitialViewState(museums, userLatitude, userLongitude);

  // Fits the camera around museums + user position. Guards against the
  // MapLibre Camera ref being populated asynchronously (the ref is set only
  // after the native map view mounts, so the first effect invocation on new
  // data can land before the ref is ready — we retry on load completion).
  const fitCameraToData = useCallback(() => {
    if (userPannedRef.current) return;
    const camera = cameraRef.current;
    if (!camera) return;

    const target = computeMuseumMapFitTarget(museumCollection, userLatitude, userLongitude);
    if (target.kind === 'skip-empty') return;
    if (target.kind === 'skip-too-wide') {
      hasFittedRef.current = true;
      return;
    }
    // First fit is always instant regardless of reduceMotion — no animation before first paint.
    const duration = !hasFittedRef.current || reduceMotion ? 0 : FIT_DURATION_MS;
    if (target.kind === 'flyTo') {
      camera.flyTo({ center: target.center, zoom: target.zoom, duration });
    } else {
      camera.fitBounds(target.bounds, {
        padding: {
          top: FIT_PADDING,
          right: FIT_PADDING,
          bottom: FIT_PADDING,
          left: FIT_PADDING,
        },
        duration,
      });
    }
    hasFittedRef.current = true;
  }, [museumCollection, reduceMotion, userLatitude, userLongitude]);

  useEffect(() => {
    fitCameraToData();
  }, [fitCameraToData]);

  // Render-start instrumentation depends on the museum dataset, NOT on the
  // memoized fit callback. Splitting preserves the original dep set
  // (`[museumCollection]`) — combining would widen the trigger to whatever
  // `fitCameraToData` closes over (reduceMotion, GPS), causing extra dev-only
  // perf marks on unrelated re-renders.
  useEffect(() => {
    if (__DEV__) {
      perfStore.markRenderStart();
    }
  }, [museumCollection]);

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, bounds, zoom, userInteraction } = event.nativeEvent;
      if (userInteraction) {
        userPannedRef.current = true;
      }
      const [lng, lat] = center;
      // Persist only explicit user moves. Programmatic fits intentionally skip
      // so the cached camera mirrors the user's last deliberate intent.
      mapCameraCache.save({ centerLng: lng, centerLat: lat, zoom }, userInteraction);
      if (!onMapMoved) return;
      onMapMoved(lat, lng, bounds);
    },
    [onMapMoved],
  );

  const handleMuseumPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = event.nativeEvent.features.at(0);
      if (!feature) return;
      const properties = feature.properties as PressedProperties | null;
      if (!properties) return;

      if (isClusterProperties(properties)) {
        userPannedRef.current = true;
        const source = museumsSourceRef.current;
        const point = feature.geometry.type === 'Point' ? feature.geometry : null;
        const center = point?.coordinates as [number, number] | undefined;
        if (!source || !center) return;
        const duration = reduceMotion ? 0 : CLUSTER_EXPAND_DURATION_MS;
        source
          .getClusterExpansionZoom(properties.cluster_id)
          .then((zoom) => {
            cameraRef.current?.flyTo({ center, zoom, duration });
          })
          .catch(() => {
            cameraRef.current?.flyTo({
              center,
              zoom: CLUSTER_EXPAND_ZOOM_FALLBACK,
              duration,
            });
          });
        return;
      }

      if (!onMuseumSelect) return;
      const museum = museums.find((m) => m.id === properties.museumId);
      if (museum) onMuseumSelect(museum);
    },
    [museums, onMuseumSelect, reduceMotion],
  );

  const handleDidFailLoadingMap = useCallback(() => {
    setHasLoadError(true);
    reportError(new Error('MuseumMapView failed to load map style'), {
      component: 'MuseumMapView',
      reason: 'maplibre_style_load_failed',
    });
  }, []);

  const handleDidFinishLoadingMap = useCallback(() => {
    setHasLoadError(false);
    // Skip retry if the data-driven effect already ran the fit once the camera
    // was ready — otherwise we'd double-fit and the map would visibly jump.
    if (hasFittedRef.current) return;
    fitCameraToData();
  }, [fitCameraToData]);

  const handleDidFinishRenderingMapFully = useCallback(() => {
    if (__DEV__) perfStore.markRenderEnd();
  }, []);

  const isEmpty = museums.length === 0;
  const visibleMuseumCount = museumCollection.features.length;
  const mapA11yLabel = t('museumDirectory.map_a11y_label', { count: visibleMuseumCount });

  if (initialViewState === null) {
    // AsyncStorage lookup is async; holding the Map mount until we resolve the
    // starting view prevents a flicker where the camera would render with
    // defaults then jump to the cached/GPS position on the next frame.
    return (
      <View
        style={[styles.container, styles.loadingContainer]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('museumDirectory.map_a11y_label', { count: 0 })}
      >
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Map
        accessibilityLabel={mapA11yLabel}
        accessibilityHint={t('museumDirectory.map_a11y_hint')}
        style={[
          styles.map,
          { borderColor: theme.cardBorder, backgroundColor: theme.pageGradient[0] },
        ]}
        mapStyle={mapStyle}
        onRegionDidChange={handleRegionDidChange}
        onDidFailLoadingMap={handleDidFailLoadingMap}
        onDidFinishLoadingMap={handleDidFinishLoadingMap}
        onDidFinishRenderingMapFully={handleDidFinishRenderingMapFully}
        attribution
        logo={false}
        compass={false}
      >
        <Camera ref={cameraRef} initialViewState={initialViewState} />
        <MuseumMapMarkers
          museumCollection={museumCollection}
          userCollection={userCollection}
          museumsSourceRef={museumsSourceRef}
          primaryColor={theme.primary}
          onMuseumPress={handleMuseumPress}
        />
      </Map>
      <MuseumMapStatusOverlay isEmpty={isEmpty} hasLoadError={hasLoadError} />
      {__DEV__ ? <PerfOverlay /> : null}
      {nearestCity ? (
        <OfflinePackPrompt
          visible={offlinePrompt.visible}
          cityId={nearestCity.cityId}
          cityName={nearestCity.cityName}
          onAccept={offlinePrompt.accept}
          onDecline={offlinePrompt.decline}
          testID="museum-map-offline-prompt"
        />
      ) : null}
    </View>
  );
};
