import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  Map,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PerfOverlay } from '@/features/diagnostics/PerfOverlay';
import { perfStore } from '@/features/diagnostics/perfStore';
import { reportError } from '@/shared/observability/errorReporting';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

import {
  buildMuseumFeatureCollection,
  type MuseumFeatureProperties,
} from '../application/buildMuseumFeatureCollection';
import { haversineDistanceMeters } from '../application/haversine';
import { useMapStyle } from '../application/useMapStyle';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { mapCameraCache } from '../infrastructure/mapCameraCache';

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

const MUSEUMS_SOURCE_ID = 'museums';
const MUSEUM_POINTS_LAYER_ID = 'museum-points';
const CLUSTER_CIRCLES_LAYER_ID = 'museum-clusters';
const CLUSTER_COUNT_LAYER_ID = 'museum-cluster-count';
const USER_SOURCE_ID = 'user-position';
const USER_DOT_LAYER_ID = 'user-dot';
const USER_HALO_LAYER_ID = 'user-halo';

const CLUSTER_RADIUS_PX = 60;
const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_EXPAND_ZOOM_FALLBACK = 16;
const CLUSTER_EXPAND_DURATION_MS = 450;

// Fallback world-centered view used only when the map loads with no user
// location AND no museum data. Any actual data — cached GPS from a previous
// session, OSM results, or the fresh GPS fix — takes precedence and is
// applied before the first frame via `initialViewState` or the fit effect.
const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;
const USER_ONLY_ZOOM = 13;
const FIT_PADDING = 72;
const FIT_MIN_SPAN_DEG = 0.01;
const FIT_DURATION_MS = 600;
const SINGLE_POINT_ZOOM = 14;
/**
 * Safety cap for auto-fit. When the dataset diagonal exceeds this (e.g. the
 * full-France directory fallback), we skip fitBounds so the camera doesn't
 * zoom the user out to a country-wide view after they had panned to a city.
 */
const MAX_FIT_SPAN_METERS = 50_000;

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

  const mapStyle = useMapStyle();
  const museumCollection = useMemo(() => buildMuseumFeatureCollection(museums), [museums]);
  const userCollection = useMemo(
    () =>
      userLatitude !== null && userLongitude !== null
        ? userPositionToCollection(userLatitude, userLongitude)
        : null,
    [userLatitude, userLongitude],
  );

  // Camera starts on the previously persisted view (last explicit user pan) when
  // available, otherwise GPS, otherwise a world-centered default. The Map is
  // rendered only after this resolves so we never paint the wrong region first
  // and then jump — which is what the old synchronous `useMemo` path did.
  const [initialViewState, setInitialViewState] = useState<{
    center: [number, number];
    zoom: number;
  } | null>(null);

  // Resolve the starting view exactly once: once we've committed an
  // `initialViewState`, later GPS arrivals are handled by the data-driven fit
  // effect and by the camera cache — not by re-seeding this state.
  const hasResolvedInitialView = initialViewState !== null;
  useEffect(() => {
    if (hasResolvedInitialView) return;
    let cancelled = false;
    void mapCameraCache.load().then((cam) => {
      if (cancelled) return;
      if (cam) {
        setInitialViewState({
          center: [cam.centerLng, cam.centerLat],
          zoom: cam.zoom,
        });
        return;
      }
      if (userLatitude !== null && userLongitude !== null) {
        setInitialViewState({ center: [userLongitude, userLatitude], zoom: USER_ONLY_ZOOM });
        return;
      }
      setInitialViewState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    });
    return () => {
      cancelled = true;
    };
  }, [hasResolvedInitialView, userLatitude, userLongitude]);

  // Fits the camera around museums + user position. Guards against the
  // MapLibre Camera ref being populated asynchronously (the ref is set only
  // after the native map view mounts, so the first effect invocation on new
  // data can land before the ref is ready — we retry on load completion).
  const fitCameraToData = useCallback(() => {
    if (userPannedRef.current) return;
    const camera = cameraRef.current;
    if (!camera) return;

    const points: [number, number][] = museumCollection.features.map(
      (f) => f.geometry.coordinates as [number, number],
    );
    if (userLatitude !== null && userLongitude !== null) {
      points.push([userLongitude, userLatitude]);
    }

    if (points.length === 0) {
      return;
    }

    // First fit is always instant regardless of reduceMotion — no animation before first paint.
    const animationDuration = !hasFittedRef.current || reduceMotion ? 0 : FIT_DURATION_MS;

    if (points.length === 1) {
      camera.flyTo({
        center: points[0],
        zoom: SINGLE_POINT_ZOOM,
        duration: animationDuration,
      });
      hasFittedRef.current = true;
      return;
    }

    let minLng = points[0][0];
    let maxLng = points[0][0];
    let minLat = points[0][1];
    let maxLat = points[0][1];
    for (const [lng, lat] of points) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    if (maxLng - minLng < FIT_MIN_SPAN_DEG) {
      minLng -= FIT_MIN_SPAN_DEG / 2;
      maxLng += FIT_MIN_SPAN_DEG / 2;
    }
    if (maxLat - minLat < FIT_MIN_SPAN_DEG) {
      minLat -= FIT_MIN_SPAN_DEG / 2;
      maxLat += FIT_MIN_SPAN_DEG / 2;
    }

    // If the dataset covers a very wide area (e.g. the full-France directory
    // fallback), skip auto-fit — otherwise a user who had zoomed into a city
    // would be yanked out to a country-wide view on the next fetch. The
    // persisted cache or GPS / user's current view governs instead.
    const diagonalMeters = haversineDistanceMeters(minLat, minLng, maxLat, maxLng);
    if (diagonalMeters > MAX_FIT_SPAN_METERS) {
      hasFittedRef.current = true;
      return;
    }

    camera.fitBounds([minLng, minLat, maxLng, maxLat], {
      padding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING },
      duration: animationDuration,
    });
    hasFittedRef.current = true;
  }, [museumCollection, reduceMotion, userLatitude, userLongitude]);

  useEffect(() => {
    fitCameraToData();
  }, [fitCameraToData]);

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, bounds, zoom, userInteraction } = event.nativeEvent;
      if (userInteraction) {
        userPannedRef.current = true;
      }
      const [lng, lat] = center;
      // Persist only explicit user moves. Programmatic fits (auto-fit, cluster
      // expansion) intentionally skip so the cached camera mirrors the user's
      // last deliberate intent, not a data-driven recenter.
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
        const point = feature.geometry?.type === 'Point' ? feature.geometry : null;
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
      if (museum) {
        onMuseumSelect(museum);
      }
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
    // If the data-driven effect already ran the fit once the camera was ready,
    // skip this retry — otherwise we'd double-fit and the map would visibly
    // jump on load.
    if (hasFittedRef.current) return;
    // Re-attempt the data fit once the native map is ready: the first effect
    // invocation on mount can fire before `cameraRef.current` is populated.
    fitCameraToData();
  }, [fitCameraToData]);

  const handleDidFinishRenderingMapFully = useCallback(() => {
    if (__DEV__) {
      perfStore.markRenderEnd();
    }
  }, []);

  useEffect(() => {
    if (__DEV__) {
      perfStore.markRenderStart();
    }
  }, [museumCollection]);

  const isEmpty = museums.length === 0;
  const visibleMuseumCount = museumCollection.features.length;
  const mapA11yLabel = t('museumDirectory.map_a11y_label', { count: visibleMuseumCount });

  if (initialViewState === null) {
    // AsyncStorage lookup is async; holding the Map mount until we resolve
    // the starting view prevents a flicker where the camera would render with
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
          {
            borderColor: theme.cardBorder,
            backgroundColor: theme.pageGradient[0],
          },
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
        <GeoJSONSource
          id={MUSEUMS_SOURCE_ID}
          ref={museumsSourceRef}
          data={museumCollection}
          cluster
          clusterRadius={CLUSTER_RADIUS_PX}
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          onPress={handleMuseumPress}
        >
          <Layer
            id={CLUSTER_CIRCLES_LAYER_ID}
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': theme.primary,
              'circle-stroke-color': semantic.mapMarker.markerBorder,
              'circle-stroke-width': 2,
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 32],
              'circle-opacity': 0.9,
            }}
          />
          <Layer
            id={CLUSTER_COUNT_LAYER_ID}
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 13,
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': semantic.mapMarker.markerBorder,
            }}
          />
          <Layer
            id={MUSEUM_POINTS_LAYER_ID}
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': [
                'match',
                ['get', 'museumType'],
                'art',
                semantic.mapMarker.museum,
                'history',
                semantic.mapMarker.restaurant,
                'science',
                semantic.mapMarker.cafe,
                'specialized',
                semantic.mapMarker.shop,
                semantic.mapMarker.default,
              ],
              'circle-radius': 7,
              'circle-stroke-width': 2,
              'circle-stroke-color': semantic.mapMarker.markerBorder,
            }}
          />
        </GeoJSONSource>
        {userCollection ? (
          <GeoJSONSource id={USER_SOURCE_ID} data={userCollection}>
            <Layer
              id={USER_HALO_LAYER_ID}
              type="circle"
              paint={{
                'circle-color': semantic.mapMarker.user,
                'circle-radius': 18,
                'circle-opacity': 0.25,
              }}
            />
            <Layer
              id={USER_DOT_LAYER_ID}
              type="circle"
              paint={{
                'circle-color': semantic.mapMarker.user,
                'circle-radius': 7,
                'circle-stroke-width': 2,
                'circle-stroke-color': semantic.mapMarker.userBorder,
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>
      {isEmpty && !hasLoadError ? (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <GlassCard style={styles.emptyCard} intensity={60}>
            <Text
              style={[styles.emptyText, { color: theme.textPrimary }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {t('museumDirectory.map_empty')}
            </Text>
          </GlassCard>
        </View>
      ) : null}
      {hasLoadError ? (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <GlassCard style={styles.emptyCard} intensity={60}>
            <Text
              style={[styles.emptyText, { color: theme.textPrimary }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {t('museumDirectory.map_error')}
            </Text>
          </GlassCard>
        </View>
      ) : null}
      {__DEV__ ? <PerfOverlay /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
    borderRadius: semantic.card.paddingLarge,
    borderWidth: semantic.input.borderWidth,
    overflow: 'hidden',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingLarge,
  },
  emptyCard: {
    paddingVertical: semantic.button.paddingYCompact,
    paddingHorizontal: semantic.card.paddingLarge,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: semantic.card.bodySize,
    fontWeight: '600',
    textAlign: 'center',
  },
});
