import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, radius } from '@/shared/ui/tokens.generated';

interface ConversationsBulkBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  isDeleting: boolean;
}

/** Bulk action footer bar shown during edit mode. */
export const ConversationsBulkBar = ({
  selectedCount,
  onSelectAll,
  onDeleteSelected,
  isDeleting,
}: ConversationsBulkBarProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.bulkBar,
        { backgroundColor: theme.cardBackground, borderTopColor: theme.cardBorder },
      ]}
    >
      <Pressable
        style={[styles.bulkBarButton, { borderColor: theme.glassBorder }]}
        onPress={onSelectAll}
        accessibilityRole="button"
        accessibilityLabel={t('conversations.select_all')}
      >
        <Ionicons name="checkmark-done-outline" size={18} color={theme.textPrimary} />
        <Text style={[styles.bulkBarButtonText, { color: theme.textPrimary }]}>
          {t('conversations.select_all')}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.bulkBarButton, { backgroundColor: theme.error, borderColor: theme.error }]}
        onPress={onDeleteSelected}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel={t('conversations.delete_selected', { count: selectedCount })}
      >
        <Ionicons name="trash-outline" size={18} color={theme.primaryContrast} />
        <Text style={[styles.bulkBarButtonText, { color: theme.primaryContrast }]}>
          {t('conversations.delete_selected', { count: selectedCount })}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.list.itemPaddingX,
    paddingVertical: semantic.list.itemPaddingY,
    borderTopWidth: semantic.list.separatorWidth,
    gap: semantic.section.gap,
  },
  bulkBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
    paddingHorizontal: space['3.5'],
    paddingVertical: space['2.5'],
    borderRadius: radius.DEFAULT,
    borderWidth: semantic.input.borderWidth,
  },
  bulkBarButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
