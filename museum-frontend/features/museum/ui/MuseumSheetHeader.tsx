import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { getCategoryStyle } from '../application/categoryColor';
import type { MuseumWithDistance } from '../application/useMuseumDirectory';
import { styles } from './museumSheet.styles';

interface MuseumSheetHeaderProps {
  museum: MuseumWithDistance;
  onClose: () => void;
}

export const MuseumSheetHeader = ({ museum, onClose }: MuseumSheetHeaderProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const category = getCategoryStyle(museum.museumType);

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleBlock}>
        <Text
          style={[styles.name, { color: theme.textPrimary }]}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {museum.name}
        </Text>
        <View style={[styles.categoryChip, { backgroundColor: category.color + '1F' }]}>
          <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
          <Text style={[styles.categoryLabel, { color: category.color }]}>
            {t(category.labelKey)}
          </Text>
        </View>
      </View>
      <Pressable
        style={styles.closeButton}
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('museumDirectory.close_sheet_a11y')}
      >
        <Ionicons name="close" size={22} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
};
