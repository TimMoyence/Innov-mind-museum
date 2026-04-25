import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- RN image require pattern
const musaiumLogo = require('../../assets/images/logo.png') as ImageSourcePropType;

type BrandMarkVariant = 'auth' | 'auth-compact' | 'hero' | 'header';

interface BrandMarkProps {
  variant?: BrandMarkVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const resolveResponsiveSize = (variant: BrandMarkVariant, viewportWidth: number) => {
  if (variant === 'auth') {
    return clamp(Math.round(viewportWidth * 0.34), 96, 132);
  }

  if (variant === 'auth-compact') {
    return clamp(Math.round(viewportWidth * 0.18), 64, 80);
  }

  if (variant === 'header') {
    return clamp(Math.round(viewportWidth * 0.28), 88, 120);
  }

  return clamp(Math.round(viewportWidth * 0.5), 140, 184);
};

/** Displays the Musaium logo at a responsive size determined by the chosen variant (auth, hero, or header). */
export const BrandMark = ({ variant = 'hero', size, style }: BrandMarkProps) => {
  const { width } = useWindowDimensions();
  const resolvedSize = size ?? resolveResponsiveSize(variant, width);

  return (
    <View style={[styles.container, { width: resolvedSize, height: resolvedSize }, style]}>
      <Image
        source={musaiumLogo}
        resizeMode="contain"
        accessibilityLabel="Musaium logo"
        style={styles.image}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
