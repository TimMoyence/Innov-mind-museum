import {
  GeoJSONSource,
  type GeoJSONSourceRef,
  Layer,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import type { Ref } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { semantic } from '@/shared/ui/tokens';

import type { MuseumFeatureProperties } from '../application/buildMuseumFeatureCollection';

const MUSEUMS_SOURCE_ID = 'museums';
const MUSEUM_POINTS_LAYER_ID = 'museum-points';
const CLUSTER_CIRCLES_LAYER_ID = 'museum-clusters';
const CLUSTER_COUNT_LAYER_ID = 'museum-cluster-count';
const USER_SOURCE_ID = 'user-position';
const USER_DOT_LAYER_ID = 'user-dot';
const USER_HALO_LAYER_ID = 'user-halo';

const CLUSTER_RADIUS_PX = 60;
const CLUSTER_MAX_ZOOM = 14;

interface MuseumMapMarkersProps {
  museumCollection: FeatureCollection<Point, MuseumFeatureProperties>;
  userCollection: FeatureCollection<Point> | null;
  museumsSourceRef: Ref<GeoJSONSourceRef>;
  primaryColor: string;
  onMuseumPress: (event: NativeSyntheticEvent<PressEventWithFeatures>) => void;
}

/**
 * Renders the museum cluster + per-point GeoJSON layers and the user-position
 * halo + dot. Extracted from `MuseumMapView` so the component shell stays
 * under the 300 LOC budget. The source / layer IDs and paint expressions are
 * preserved verbatim so the existing component test suite (which asserts via
 * the mocked `source-*` / `layer-*` testIDs) continues to pass without edits.
 */
export const MuseumMapMarkers = ({
  museumCollection,
  userCollection,
  museumsSourceRef,
  primaryColor,
  onMuseumPress,
}: MuseumMapMarkersProps) => (
  <>
    <GeoJSONSource
      id={MUSEUMS_SOURCE_ID}
      ref={museumsSourceRef}
      data={museumCollection}
      cluster
      clusterRadius={CLUSTER_RADIUS_PX}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      onPress={onMuseumPress}
    >
      <Layer
        id={CLUSTER_CIRCLES_LAYER_ID}
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': primaryColor,
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
  </>
);
