import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ConversationsHeaderProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onToggleSortMode: () => void;
  onToggleSavedFilter: () => void;
  onShareDashboard: () => Promise<void>;
  isSavedOnly: boolean;
  sortMode: string;
}

/** Menu row + hero card for the conversations dashboard. */
export const ConversationsHeader = ({
  editMode,
  onToggleEdit,
  onToggleSortMode,
  onToggleSavedFilter,
  onShareDashboard,
  isSavedOnly,
  sortMode,
}: ConversationsHeaderProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <>
      <View style={styles.menuRow}>
        <FloatingContextMenu
          actions={[
            {
              id: 'sort',
              icon: 'filter-outline',
              label: t('conversations.filter'),
              onPress: onToggleSortMode,
            },
            {
              id: 'bookmark',
              icon: 'bookmark-outline',
              label: t('conversations.saved'),
              onPress: onToggleSavedFilter,
            },
            {
              id: 'share',
              icon: 'share-social-outline',
              label: t('conversations.share'),
              onPress: () => {
                void onShareDashboard();
              },
            },
            {
              id: 'edit',
              icon: editMode ? 'close-outline' : 'create-outline',
              label: editMode ? t('common.cancel') : t('conversations.edit'),
              onPress: onToggleEdit,
              active: editMode,
            },
          ]}
        />
      </View>

      <GlassCard style={styles.headerCard} intensity={60}>
        <BrandMark variant="header" style={styles.brand} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('conversations.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('conversations.subtitle')}
        </Text>
        <Text style={[styles.metaLine, { color: theme.primary }]}>
          {isSavedOnly ? t('conversations.saved_filter_on') : t('conversations.saved_filter_off')} •{' '}
          {t('conversations.sort_label', { sortMode })}
        </Text>
      </GlassCard>
    </>
  );
};

const styles = StyleSheet.create({
  menuRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  brand: {
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  metaLine: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
