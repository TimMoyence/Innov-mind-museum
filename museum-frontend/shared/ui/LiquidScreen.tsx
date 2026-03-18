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

import {
  liquidColors,
  type ResponsiveBackground,
  viewportConfig,
} from './liquidTheme';

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
    value !== null &&
    !Array.isArray(value) &&
    'mobile' in value &&
    'desktop' in value
  );
};

/** Renders a full-screen layout with a gradient background, responsive background image, and centered content area. */
export const LiquidScreen = ({
  children,
  background,
  contentStyle,
}: LiquidScreenProps) => {
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
  const resizeMode = isDesktop
    ? viewportConfig.desktopResizeMode
    : viewportConfig.mobileResizeMode;

  return (
    <View style={[styles.container, { minHeight: height, height }]}>
      <LinearGradient
        colors={liquidColors.pageGradient}
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
        colors={[
          'rgba(255,255,255,0.70)',
          'rgba(224,238,255,0.56)',
          'rgba(216,242,255,0.58)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* <View style={styles.glowA} />
      <View style={styles.glowB} /> */}
      <View
        style={[
          styles.content,
          isDesktop && styles.desktopContent,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#EAF2FF',
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
  // glowA: {
  //   position: 'absolute',
  //   top: -70,
  //   right: -46,
  //   width: 210,
  //   height: 210,
  //   borderRadius: 999,
  //   backgroundColor: 'rgba(147,197,253,0.24)',
  // },
  // glowB: {
  //   position: 'absolute',
  //   bottom: -90,
  //   left: -65,
  //   width: 230,
  //   height: 230,
  //   borderRadius: 999,
  //   backgroundColor: 'rgba(125,211,252,0.18)',
  // },
});
