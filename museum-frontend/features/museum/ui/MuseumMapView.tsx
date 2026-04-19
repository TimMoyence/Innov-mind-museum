import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  Map,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PerfOverlay } from '@/features/diagnostics/PerfOverlay';
import { perfStore } from '@/features/diagnostics/perfStore';
import { reportError } from '@/shared/observability/errorReporting';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

import {
  buildMuseumFeatureCollection,
  type MuseumFeatureProperties,
} from '../application/buildMuseumFeatureCollection';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import '../infrastructure/mapLibreBootstrap';
import { buildOsmRasterStyle } from '../infrastructure/mapLibreStyle';

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

interface PressEventWithFeatures {
  features: { properties: PressedProperties | null }[];
}

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

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566];
const DEFAULT_ZOOM = 4;
const FIT_PADDING = 72;
const FIT_MIN_SPAN_DEG = 0.01;
const FIT_DURATION_MS = 600;
const SINGLE_POINT_ZOOM = 14;

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
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const cameraRef = useRef<CameraRef>(null);
  const museumsSourceRef = useRef<GeoJSONSourceRef>(null);
  const userPannedRef = useRef(false);
  const hasFittedRef = useRef(false);

  const mapStyle = useMemo(() => buildOsmRasterStyle(isDark), [isDark]);
  const museumCollection = useMemo(() => buildMuseumFeatureCollection(museums), [museums]);
  const userCollection = useMemo(
    () =>
      userLatitude !== null && userLongitude !== null
        ? userPositionToCollection(userLatitude, userLongitude)
        : null,
    [userLatitude, userLongitude],
  );

  // Fit the camera to show all points the first time data becomes available,
  // and whenever the dataset meaningfully changes AFTER the user has not taken
  // over the camera with a pan gesture.
  useEffect(() => {
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

    if (points.length === 1) {
      camera.flyTo({
        center: points[0],
        zoom: SINGLE_POINT_ZOOM,
        duration: hasFittedRef.current ? FIT_DURATION_MS : 0,
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
    // Avoid a zero-area bbox collapsing the fitBounds call.
    if (maxLng - minLng < FIT_MIN_SPAN_DEG) {
      minLng -= FIT_MIN_SPAN_DEG / 2;
      maxLng += FIT_MIN_SPAN_DEG / 2;
    }
    if (maxLat - minLat < FIT_MIN_SPAN_DEG) {
      minLat -= FIT_MIN_SPAN_DEG / 2;
      maxLat += FIT_MIN_SPAN_DEG / 2;
    }

    camera.fitBounds([minLng, minLat, maxLng, maxLat], {
      padding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING },
      duration: hasFittedRef.current ? FIT_DURATION_MS : 0,
    });
    hasFittedRef.current = true;
  }, [museumCollection, userLatitude, userLongitude]);

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, bounds, userInteraction } = event.nativeEvent;
      if (userInteraction) {
        userPannedRef.current = true;
      }
      if (!onMapMoved) return;
      const [lng, lat] = center;
      onMapMoved(lat, lng, bounds);
    },
    [onMapMoved],
  );

  const handleMuseumPress = useCallback(
    (event: NativeSyntheticEvent<unknown>) => {
      const nativeEvent = event.nativeEvent as PressEventWithFeatures;
      const feature = nativeEvent.features.at(0);
      if (!feature) return;
      const { properties } = feature;
      if (!properties) return;

      if (isClusterProperties(properties)) {
        userPannedRef.current = true;
        const source = museumsSourceRef.current;
        const geometry = (feature as { geometry?: { coordinates?: [number, number] } }).geometry;
        const center = geometry?.coordinates;
        if (!source || !center) return;
        source
          .getClusterExpansionZoom(properties.cluster_id)
          .then((zoom) => {
            cameraRef.current?.flyTo({
              center,
              zoom,
              duration: CLUSTER_EXPAND_DURATION_MS,
            });
          })
          .catch(() => {
            cameraRef.current?.flyTo({
              center,
              zoom: CLUSTER_EXPAND_ZOOM_FALLBACK,
              duration: CLUSTER_EXPAND_DURATION_MS,
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
    [museums, onMuseumSelect],
  );

  const handleDidFailLoadingMap = useCallback(() => {
    reportError(new Error('MuseumMapView failed to load map style'), {
      component: 'MuseumMapView',
      reason: 'maplibre_style_load_failed',
    });
  }, []);

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

  return (
    <View style={styles.container}>
      <Map
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
        onDidFinishRenderingMapFully={handleDidFinishRenderingMapFully}
        attribution
        logo={false}
        compass={false}
      >
        <Camera ref={cameraRef} initialViewState={{ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }} />
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
      {isEmpty ? (
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
      <PerfOverlay />
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
