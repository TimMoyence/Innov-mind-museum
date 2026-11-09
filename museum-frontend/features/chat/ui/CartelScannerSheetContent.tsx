import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, PermissionStatus, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import {
  parseMusaiumDeeplink,
  sanitizeCartelCode,
  type MusaiumDeeplink,
} from '@/features/chat/application/sanitizeCartelCode';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

interface CartelScannerSheetContentProps {
  readonly onScanned: (payload: string | MusaiumDeeplink) => void;
  readonly close: () => void;
}

export function CartelScannerSheetContent({ onScanned, close }: CartelScannerSheetContentProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const requestedRef = useRef(false);
  useEffect(() => {
    if (permission?.status === PermissionStatus.UNDETERMINED && !requestedRef.current) {
      requestedRef.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = useCallback(
    ({ data }: { data: string; type: string }) => {
      if (scannedRef.current) return;
      const deeplink = parseMusaiumDeeplink(data);
      if (deeplink !== null) {
        scannedRef.current = true;
        AccessibilityInfo.announceForAccessibility(t('a11y.cartelScanner.scan_success'));
        onScanned(deeplink);
        close();
        return;
      }
      const code = sanitizeCartelCode(data);
      if (code === null) return;
      scannedRef.current = true;
      AccessibilityInfo.announceForAccessibility(t('a11y.cartelScanner.scan_success'));
      onScanned(code);
      close();
    },
    [onScanned, close, t],
  );

  if (permission === null || permission.status === PermissionStatus.UNDETERMINED) {
    return (
      <View
        style={[styles.root, styles.center, { backgroundColor: theme.cardBackground }]}
        testID="cartel-scanner-permission-pending"
      >
        <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
          {t('chat.cartelScanner.permission_title')}
        </Text>
        <ActivityIndicator color={theme.primary} style={styles.spacerSmall} />
      </View>
    );
  }

  if (permission.status === PermissionStatus.DENIED) {
    return (
      <View
        style={[styles.root, styles.center, { backgroundColor: theme.cardBackground }]}
        testID="cartel-scanner-permission-denied"
      >
        <Ionicons name="camera-reverse-outline" size={48} color={theme.error} />
        <Text style={[styles.title, { color: theme.error }]} accessibilityRole="header">
          {t('chat.cartelScanner.permission_title')}
        </Text>
        <Text style={[styles.body, { color: theme.textPrimary }]}>
          {t('chat.cartelScanner.permission_body')}
        </Text>
        <Pressable
          onPress={() => {
            void Linking.openSettings();
          }}
          testID="cartel-scanner-open-settings"
          accessibilityRole="button"
          accessibilityLabel={t('chat.cartelScanner.permission_open_settings')}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: theme.surface }]}>
            {t('chat.cartelScanner.permission_open_settings')}
          </Text>
        </Pressable>
        <Pressable
          onPress={close}
          testID="cartel-scanner-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('chat.cartelScanner.cancel')}
          accessibilityHint={t('a11y.cartelScanner.cancel_hint')}
          style={[
            styles.secondaryButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
            {t('chat.cartelScanner.cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <CameraView
        style={styles.preview}
        facing="back"
        onBarcodeScanned={handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        testID="cartel-scanner-viewfinder"
        accessibilityLabel={t('a11y.cartelScanner.viewfinder_hint')}
      />
      <View style={styles.overlayTop} pointerEvents="box-none">
        <Pressable
          onPress={close}
          testID="cartel-scanner-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('chat.cartelScanner.cancel')}
          accessibilityHint={t('a11y.cartelScanner.cancel_hint')}
          style={[
            styles.cancelButton,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
          hitSlop={10}
        >
          <Ionicons name="close" size={22} color={theme.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.overlayBottom} pointerEvents="none">
        <Text
          style={[
            styles.instructions,
            { color: theme.textPrimary, backgroundColor: theme.surface },
          ]}
        >
          {t('chat.cartelScanner.instructions')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingXL,
    gap: semantic.form.gapLarge,
  },
  preview: {
    flex: 1,
  },
  overlayTop: {
    position: 'absolute',
    top: space['4'],
    right: space['4'],
  },
  overlayBottom: {
    position: 'absolute',
    bottom: space['8'],
    left: space['4'],
    right: space['4'],
    alignItems: 'center',
  },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructions: {
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: space['2'],
    borderRadius: radius.lg,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize['base-'],
    textAlign: 'center',
  },
  spacerSmall: {
    marginTop: space['3'],
  },
  primaryButton: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: space['3'],
    borderRadius: radius.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  secondaryButton: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: space['3'],
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
});
