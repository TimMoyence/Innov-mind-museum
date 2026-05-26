import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, space } from '@/shared/ui/tokens';

interface MuseumLogoProps {
  /** Validated HTTPS logo URL (from {@link MuseumBranding}); absent → fallback. */
  logoUrl?: string;
  /** Museum name — used for the a11y label and the fallback icon's context. */
  museumName: string;
  /** Optional style override for the logo / fallback container. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders a museum's co-branding logo. Uses `expo-image` (PREFERRED — cache +
 * `contentFit`; expo-image/PATTERNS.md:8,46) with `cachePolicy="memory-disk"`
 * and an `onError` → fallback flip. When the logo is absent / empty / errors,
 * renders a `business` Ionicon fallback (PNG / Ionicons only — never emoji).
 * a11y: `accessibilityRole="image"` + a name-derived label (react-native
 * PATTERNS.md §7).
 */
export const MuseumLogo = ({ logoUrl, museumName, style }: MuseumLogoProps): React.JSX.Element => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [hasError, setHasError] = useState(false);

  const showLogo = Boolean(logoUrl) && !hasError;
  const a11yLabel = t('museumBranding.logo_a11y', { name: museumName });

  if (showLogo) {
    return (
      <Image
        source={{ uri: logoUrl }}
        // expo-image expects `ImageStyle`, not `ViewStyle`; the override only
        // carries box-layout props (width/height/borderRadius) valid in both
        // (expo-image PATTERNS.md:46,§5 — Image takes its own RNImageStyle-derived type).
        style={[styles.logo, style] as StyleProp<ImageStyle>}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
        accessibilityIgnoresInvertColors
        onError={() => {
          setHasError(true);
        }}
      />
    );
  }

  return (
    <View
      testID="museum-logo-fallback"
      style={[styles.fallback, style]}
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <Ionicons name="business" size={40} color={theme.primary} />
    </View>
  );
};

const styles = StyleSheet.create({
  logo: {
    width: space['14'],
    height: space['14'],
    borderRadius: radius.lg,
  },
  fallback: {
    width: space['14'],
    height: space['14'],
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
