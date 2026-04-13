import { useCallback, useEffect, useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
} from 'react-native-webview/lib/WebViewTypes';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';
import { reportError } from '@/shared/observability/errorReporting';
import type { MuseumCategory, MuseumWithDistance } from '../application/useMuseumDirectory';
import { buildLeafletHtml } from '../infrastructure/leafletHtml';
import { shouldAllowNavigation } from '../infrastructure/webViewNavigation';

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
  const { t } = useTranslation();
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
    const markers: {
      id: number;
      name: string;
      lat: number;
      lng: number;
      source: 'local' | 'osm';
      museumType: MuseumCategory;
    }[] = [];
    const points: [number, number][] = [];

    for (const m of museums) {
      if (m.latitude !== null && m.longitude !== null) {
        markers.push({
          id: m.id,
          name: m.name,
          lat: m.latitude,
          lng: m.longitude,
          source: m.source,
          museumType: m.museumType,
        });
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
      } catch (error) {
        reportError(error, {
          component: 'MuseumMapView',
          reason: 'webview_message_parse_failed',
          rawPreview: event.nativeEvent.data.slice(0, 200),
        });
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
  const isEmpty = museums.length === 0;

  const handleShouldStartLoad = useCallback((request: { url: string }) => {
    const decision = shouldAllowNavigation(request.url);
    if (decision === 'external') {
      void Linking.openURL(request.url);
      return false;
    }
    return decision === 'allow';
  }, []);

  const handleWebViewError = useCallback((event: WebViewErrorEvent) => {
    const { code, description, url } = event.nativeEvent;
    reportError(new Error(`MuseumMapView WebView error: ${description}`), {
      component: 'MuseumMapView',
      reason: 'webview_load_error',
      code: String(code),
      url: url.slice(0, 200),
    });
  }, []);

  const handleWebViewHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { statusCode, url } = event.nativeEvent;
    reportError(new Error(`MuseumMapView WebView HTTP error ${String(statusCode)}`), {
      component: 'MuseumMapView',
      reason: 'webview_http_error',
      statusCode: String(statusCode),
      url: url.slice(0, 200),
    });
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['http://*', 'https://*', 'about:*']}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        onError={handleWebViewError}
        onHttpError={handleWebViewHttpError}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  webView: {
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
