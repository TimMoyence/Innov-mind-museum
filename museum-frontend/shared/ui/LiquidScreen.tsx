import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Image,
  type ImageSourcePropType,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { type ResponsiveBackground, viewportConfig } from './liquidTheme';
import { useTheme } from './ThemeContext';

interface LiquidScreenProps {
  children: ReactNode;
  background: ImageSourcePropType | ResponsiveBackground;
  contentStyle?: StyleProp<ViewStyle>;
}

const isResponsiveBackground = (
  value: ImageSourcePropType | ResponsiveBackground,
): value is ResponsiveBackground => {
  return (
    typeof value === 'object' &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- responsive type guard
    value !== null &&
    !Array.isArray(value) &&
    'mobile' in value &&
    'desktop' in value
  );
};

/** Renders a full-screen layout with a gradient background, responsive background image, and centered content area. */
export const LiquidScreen = ({ children, background, contentStyle }: LiquidScreenProps) => {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= viewportConfig.desktopBreakpoint;
  const imageSource = isResponsiveBackground(background)
    ? isDesktop
      ? background.desktop
      : background.mobile
    : background;

  const backgroundOpacity = isDesktop
    ? viewportConfig.desktopBackgroundOpacity
    : viewportConfig.mobileBackgroundOpacity;
  const resizeMode = isDesktop ? viewportConfig.desktopResizeMode : viewportConfig.mobileResizeMode;

  return (
    <View
      style={[
        styles.container,
        { minHeight: height, height, backgroundColor: theme.pageGradient[0] },
      ]}
    >
      <LinearGradient
        colors={theme.pageGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={imageSource}
        resizeMode={resizeMode}
        style={[styles.backgroundImage, { opacity: backgroundOpacity }]}
      />
      <LinearGradient
        colors={[theme.overlay, theme.surface, theme.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, isDesktop && styles.desktopContent, contentStyle]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  desktopContent: {
    maxWidth: viewportConfig.desktopMaxContentWidth,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
});
