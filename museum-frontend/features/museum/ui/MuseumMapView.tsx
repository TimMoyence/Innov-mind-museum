import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '@/shared/ui/ThemeContext';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { buildLeafletHtml } from '../infrastructure/leafletHtml';

interface MuseumMapViewProps {
  museums: MuseumWithDistance[];
  userLatitude: number | null;
  userLongitude: number | null;
  onMapMoved?: (lat: number, lng: number) => void;
}

interface WebViewOutboundMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Renders an interactive Leaflet map inside a WebView showing museum markers
 * and the user's current position.
 */
export const MuseumMapView = ({
  museums,
  userLatitude,
  userLongitude,
  onMapMoved,
}: MuseumMapViewProps) => {
  const { theme, isDark } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const isMapReady = useRef(false);
  const messageQueue = useRef<object[]>([]);
  const userPannedRef = useRef(false);

  /** Safely send a JSON message to the WebView, queuing if the map is not ready yet. */
  const sendMessage = useCallback((msg: object) => {
    if (!isMapReady.current) {
      messageQueue.current.push(msg);
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`,
    );
  }, []);

  /** Flush any messages that were queued before the map was ready. */
  const flushQueue = useCallback(() => {
    for (const msg of messageQueue.current) {
      webViewRef.current?.injectJavaScript(
        `window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`,
      );
    }
    messageQueue.current = [];
  }, []);

  /** Push markers + user position + fit bounds whenever data changes. */
  const syncMapState = useCallback(() => {
    // Markers — collect only museums with valid coordinates
    const markers: { id: number; name: string; lat: number; lng: number }[] = [];
    const points: [number, number][] = [];

    for (const m of museums) {
      if (m.latitude !== null && m.longitude !== null) {
        markers.push({ id: m.id, name: m.name, lat: m.latitude, lng: m.longitude });
        points.push([m.latitude, m.longitude]);
      }
    }

    sendMessage({ type: 'setMarkers', markers });

    // User position
    if (userLatitude !== null && userLongitude !== null) {
      sendMessage({ type: 'setUserPosition', lat: userLatitude, lng: userLongitude });
      points.push([userLatitude, userLongitude]);
    }

    // Skip fitBounds after user drag so the map stays where the user panned.
    if (userPannedRef.current) {
      userPannedRef.current = false;
      return;
    }

    if (points.length >= 2) {
      const lats = points.map((p) => p[0]);
      const lngs = points.map((p) => p[1]);
      sendMessage({
        type: 'fitBounds',
        bounds: [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
      });
    } else if (points.length === 1) {
      sendMessage({
        type: 'fitBounds',
        bounds: [
          [points[0][0] - 0.01, points[0][1] - 0.01],
          [points[0][0] + 0.01, points[0][1] + 0.01],
        ],
      });
    }
  }, [museums, userLatitude, userLongitude, sendMessage]);

  // Re-sync whenever museums or user location change (only if map is ready).
  useEffect(() => {
    if (isMapReady.current) {
      syncMapState();
    }
  }, [syncMapState]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: WebViewOutboundMessage;
      try {
        data = JSON.parse(event.nativeEvent.data) as WebViewOutboundMessage;
      } catch {
        return;
      }

      if (data.type === 'mapReady') {
        isMapReady.current = true;
        flushQueue();
        syncMapState();
      }

      if (data.type === 'mapMoved') {
        userPannedRef.current = true;
        onMapMoved?.(data.lat as number, data.lng as number);
      }

      if (data.type === 'markerClick') {
        const museum = museums.find((m) => m.id === data.id);
        if (museum) {
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
        }
      }
    },
    [museums, flushQueue, syncMapState, onMapMoved],
  );

  const html = buildLeafletHtml({ isDark });

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      originWhitelist={['*']}
      onMessage={handleMessage}
      style={[
        styles.webView,
        {
          borderColor: theme.cardBorder,
          backgroundColor: theme.pageGradient[0],
        },
      ]}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
    />
  );
};

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
