import { StyleSheet, View } from 'react-native';
import { SkeletonBox } from './SkeletonBox';
import { useTheme } from './ThemeContext';
import { semantic, space, radius, fontSize } from './tokens';

interface SkeletonChatBubbleProps {
  alignSelf?: 'flex-start' | 'flex-end';
}

export const SkeletonChatBubble = ({ alignSelf = 'flex-start' }: SkeletonChatBubbleProps) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.bubble,
        { alignSelf, borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
    >
      <SkeletonBox width="100%" height={fontSize.xs} borderRadius={radius.sm} />
      <SkeletonBox
        width="80%"
        height={fontSize.xs}
        borderRadius={radius.sm}
        style={{ marginTop: space['1.5'] }}
      />
      <SkeletonBox
        width="40%"
        height={semantic.chat.gap}
        borderRadius={radius.xs}
        style={{ marginTop: semantic.chat.gap }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '75%',
    borderRadius: semantic.chat.bubbleRadius,
    padding: semantic.chat.bubblePadding,
    borderWidth: semantic.input.borderWidth,
    marginBottom: space['2.5'],
  },
});
