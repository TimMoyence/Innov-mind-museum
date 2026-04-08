import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';

interface ConversationsHeaderProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onToggleSortMode: () => void;
  onToggleSavedFilter: () => void;
  onShareDashboard: () => Promise<void>;
}

/** Top context menu row for the conversations dashboard. */
export const ConversationsHeader = ({
  editMode,
  onToggleEdit,
  onToggleSortMode,
  onToggleSavedFilter,
  onShareDashboard,
}: ConversationsHeaderProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.menuRow}>
      <FloatingContextMenu
        scrollable
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
  );
};

const styles = StyleSheet.create({
  menuRow: {
    alignItems: 'center',
  },
});
