/* eslint-disable react-native/no-inline-styles -- small static spacing values */
import { StyleSheet, View } from 'react-native';
import { SkeletonBox } from './SkeletonBox';
import { useTheme } from './ThemeContext';

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
        <SkeletonBox width={40} height={40} borderRadius={20} />
        <View style={styles.textCol}>
          <SkeletonBox width="70%" height={14} borderRadius={6} />
          <SkeletonBox width="45%" height={10} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonBox width="30%" height={10} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textCol: {
    flex: 1,
  },
});
