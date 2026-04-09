import { StyleSheet, View } from 'react-native';
import { SkeletonBox } from './SkeletonBox';
import { useTheme } from './ThemeContext';
import { semantic } from './tokens.semantic';
import { space, radius, fontSize } from './tokens.generated';

export const SkeletonConversationCard = () => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
    >
      <View style={styles.row}>
        <SkeletonBox width={space['10']} height={space['10']} borderRadius={semantic.card.radius} />
        <View style={styles.textCol}>
          <SkeletonBox width="70%" height={fontSize.sm} borderRadius={radius.sm} />
          <SkeletonBox
            width="45%"
            height={space['2.5']}
            borderRadius={radius.xs}
            style={{ marginTop: space['1.5'] }}
          />
        </View>
      </View>
      <SkeletonBox
        width="30%"
        height={space['2.5']}
        borderRadius={radius.xs}
        style={{ marginTop: semantic.card.gapSmall }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: semantic.chat.bubbleRadius,
    padding: space['3.5'],
    borderWidth: semantic.input.borderWidth,
    marginBottom: space['2.5'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
  },
  textCol: {
    flex: 1,
  },
});
