import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, space } from '@/shared/ui/tokens';

interface MuseumLogoProps {
  logoUrl?: string;
  museumName: string;
  style?: StyleProp<ViewStyle>;
}

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
