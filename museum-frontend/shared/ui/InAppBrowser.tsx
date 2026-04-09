import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, fontSize as fontSizeTokens } from './tokens';

interface InAppBrowserProps {
  /** URL to load. `null` hides the modal. */
  url: string | null;
  /** Called when the user closes the browser. */
  onClose: () => void;
}

/**
 * In-app browser modal using `react-native-webview`. Lets users tap a link
 * inside a chat message and view the page without leaving the app.
 *
 * Provides a top bar with: close, current URL, and an "open in system browser"
 * action that opens the URL in Safari/Chrome via `Linking.openURL`.
 */
export const InAppBrowser = ({ url, onClose }: InAppBrowserProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebViewType>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url ?? '');
  const [loadError, setLoadError] = useState(false);

  const handleOpenSystem = useCallback(() => {
    if (currentUrl) void Linking.openURL(currentUrl);
  }, [currentUrl]);

  const handleBack = useCallback(() => {
    webRef.current?.goBack();
  }, []);

  if (!url) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Pressable
            onPress={onClose}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <View style={styles.urlBar}>
            <Text
              style={[styles.urlText, { color: theme.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {safeHostFromUrl(currentUrl)}
            </Text>
          </View>
          <Pressable
            onPress={handleBack}
            disabled={!canGoBack}
            style={[styles.headerButton, !canGoBack && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={canGoBack ? theme.textPrimary : theme.textTertiary}
            />
          </Pressable>
          <Pressable
            onPress={handleOpenSystem}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('inAppBrowser.openSystem')}
          >
            <Ionicons name="open-outline" size={22} color={theme.textPrimary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={theme.primary} size="large" />
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>
              {t('inAppBrowser.loadError')}
            </Text>
            <Pressable
              onPress={handleOpenSystem}
              style={[styles.errorButton, { backgroundColor: theme.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('inAppBrowser.openSystem')}
            >
              <Text style={[styles.errorButtonText, { color: theme.primaryContrast }]}>
                {t('inAppBrowser.openSystem')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <WebView
          ref={webRef}
          source={{ uri: url }}
          onLoadStart={() => {
            setLoading(true);
            setLoadError(false);
          }}
          onLoadEnd={() => {
            setLoading(false);
          }}
          onError={() => {
            setLoading(false);
            setLoadError(true);
          }}
          onHttpError={(syntheticEvent) => {
            const status = syntheticEvent.nativeEvent.statusCode;
            if (status >= 400) {
              setLoading(false);
              setLoadError(true);
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            // Scheme allowlist: only http/https in the WebView. Hand off
            // mailto:/tel: to the system handler; block javascript:/file:/data:
            // and any other scheme to prevent in-page navigation hijacks.
            const next = request.url;
            if (next.startsWith('http://') || next.startsWith('https://')) return true;
            if (next.startsWith('mailto:') || next.startsWith('tel:')) {
              void Linking.openURL(next);
              return false;
            }
            return false;
          }}
          originWhitelist={['http://*', 'https://*']}
          javaScriptCanOpenWindowsAutomatically={false}
          startInLoadingState
          allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
          style={styles.webview}
        />
      </View>
    </Modal>
  );
};

/** Returns the hostname or the original string if URL parsing fails. */
function safeHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingX,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: semantic.card.gapTiny,
  },
  headerButton: {
    width: space['10'],
    height: space['10'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  urlBar: {
    flex: 1,
    paddingHorizontal: semantic.badge.paddingX,
  },
  urlText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
    textAlign: 'center',
  },
  webview: {
    flex: 1,
  },
  errorOverlay: {
    position: 'absolute',
    top: semantic.media.safeAreaTop,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['8'],
    gap: semantic.screen.gap,
    zIndex: 20,
  },
  errorText: {
    fontSize: fontSizeTokens['base-'],
    textAlign: 'center',
  },
  errorButton: {
    paddingHorizontal: semantic.button.paddingX,
    paddingVertical: semantic.button.paddingY,
    borderRadius: semantic.button.radiusSmall,
  },
  errorButtonText: {
    fontWeight: '700',
    fontSize: fontSizeTokens['base-'],
  },
  loadingOverlay: {
    position: 'absolute',
    top: semantic.media.safeAreaTop,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: semantic.modal.padding,
    zIndex: 10,
  },
});
