import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';

export function HorizontalStrip({ style, ...props }: ScrollViewProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      {...props}
      style={[styles.strip, style]}
    />
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
  },
});
