/* eslint-disable react-native/no-inline-styles -- small static spacing values */
import { StyleSheet, View } from 'react-native';
import { SkeletonBox } from './SkeletonBox';
import { useTheme } from './ThemeContext';

interface SkeletonChatBubbleProps {
  alignSelf?: 'flex-start' | 'flex-end';
}

export const SkeletonChatBubble = ({ alignSelf = 'flex-start' }: SkeletonChatBubbleProps) => {
  const { theme } = useTheme();

  return (
  <View style={[styles.bubble, { alignSelf, borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}>
    <SkeletonBox width='100%' height={12} borderRadius={6} />
    <SkeletonBox width='80%' height={12} borderRadius={6} style={{ marginTop: 6 }} />
    <SkeletonBox width='40%' height={8} borderRadius={4} style={{ marginTop: 8 }} />
  </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
});
