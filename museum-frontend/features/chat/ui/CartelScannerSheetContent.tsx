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
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  /**
   * Invoked exactly once on the first valid scan.
   *
   * W3 (T5.2) — payload shape:
   *   - `string` (canonical alphanumeric code) when the QR encodes a legacy
   *     `ABC-123`-style cartel reference. Sanitised via {@link sanitizeCartelCode}.
   *   - {@link MusaiumDeeplink} when the QR encodes a
   *     `musaium://museum/<uuid>/artwork/<uuid>?room=<uuid>` deeplink. Parsed
   *     via {@link parseMusaiumDeeplink} (UUID v4 validation per design.md §7).
   *
   * Callers MUST narrow on `typeof payload === 'string'` to route to the
   * legacy lookup template vs the W3 session-context propagation.
   */
  readonly onScanned: (payload: string | MusaiumDeeplink) => void;
  /** Dismiss the bottom-sheet route — supplied by the C4 router. */
  readonly close: () => void;
}

/**
 * Bottom-sheet content (fullscreen presentation) for the QR-cartel scanner.
 * Mounted by `<BottomSheetRouter>` for the `cartel-scanner` route (B4 — 9th
 * route, post-A1 attachment picker entry point).
 *
 * States :
 *   1. permission status `undetermined` / `null` → pending placeholder
 *      (auto-requests permission once on mount).
 *   2. permission `denied` → explainer panel + Open Settings + Cancel.
 *   3. permission `granted` → `<CameraView>` with `onBarcodeScanned` +
 *      idempotence guard (`scannedRef`) + cancel button anchored top-right.
 *
 * Doctrine :
 *   - Plain function (NOT React.memo) — the routes registry asserts
 *     `typeof Content === 'function'` (C4 §AC11 / B4 AC11).
 *   - No Unicode emoji (Ionicons + tokens only — doctrine
 *     `feedback_no_unicode_emoji`).
 *   - Sanitisation delegated to `sanitizeCartelCode()` — defence-in-depth
 *     vs prompt-injection (R12, R19-R22).
 *   - A11y announce ON success BEFORE close (R14/R26, ordering asserted).
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §1.3 (R8-R15) + §1.6 (R23-R27).
 */
export function CartelScannerSheetContent({ onScanned, close }: CartelScannerSheetContentProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  // Auto-request once when the permission is still undetermined. The Expo
  // hook does NOT auto-request, so we kick the prompt explicitly. We guard
  // with `requestedRef` to avoid re-triggering on every re-render. The string
  // literal comparison below is intentional — the suite mocks `expo-camera`
  // without re-exporting `PermissionStatus`, and the enum's runtime values
  // are the matching strings anyway (`granted` / `denied` / `undetermined`).
  const requestedRef = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- justification: mock module does not re-export PermissionStatus; enum values are the matching string literals at runtime; Approved-by: B4-green-2026-05-14
    if (permission?.status === 'undetermined' && !requestedRef.current) {
      requestedRef.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = useCallback(
    ({ data }: { data: string; type: string }) => {
      if (scannedRef.current) return;
      // W3 (T5.2) — try the deeplink parser first. Order matters: the legacy
      // `sanitizeCartelCode` whitelist `[A-Za-z0-9._-]` would survive `:` and
      // `/` stripping but collapse the UUID `-` separators into junk if we let
      // it run on a deeplink. Deeplink path returns a structured object;
      // alphanum path returns a string.
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

  // ── Permission pending (status null OR undetermined) ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- justification: mock module does not re-export PermissionStatus; enum runtime values are the matching strings; Approved-by: B4-green-2026-05-14
  if (permission === null || permission.status === 'undetermined') {
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

  // ── Permission denied ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- justification: mock module does not re-export PermissionStatus; enum runtime values are the matching strings; Approved-by: B4-green-2026-05-14
  if (permission.status === 'denied') {
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

  // ── Permission granted ───────────────────────────────────────────────────
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
