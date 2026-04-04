import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { DashboardSessionCard } from '@/features/chat/domain/dashboard-session';
import { SwipeableConversationCard } from '@/features/conversation/ui/SwipeableConversationCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ConversationItemProps {
  /** The session card data to render. */
  item: DashboardSessionCard;
  /** Whether bulk-edit mode is active. */
  editMode: boolean;
  /** Set of selected session IDs (for bulk-edit checkboxes). */
  selectedIds: ReadonlySet<string>;
  /** IDs of sessions the user has bookmarked. */
  savedSessionIds: string[];
  /** Toggle selection of a session in bulk-edit mode. */
  toggleSelection: (id: string) => void;
  /** Toggle the saved/bookmarked state of a session (long-press). */
  toggleSavedSession: (id: string) => void;
  /** Confirm deletion of a single session (swipe-to-delete). */
  confirmDeleteSingle: (id: string) => void;
}

/** Renders a single conversation card with swipe-to-delete support. Memoized for FlashList performance. */
export const ConversationItem = React.memo(function ConversationItem({
  item,
  editMode,
  selectedIds,
  savedSessionIds,
  toggleSelection,
  toggleSavedSession,
  confirmDeleteSingle,
}: ConversationItemProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const cardContent = (
    <Pressable
      style={[
        styles.card,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
      onPress={() => {
        if (editMode) {
          toggleSelection(item.id);
        } else {
          router.push(`/(stack)/chat/${item.id}`);
        }
      }}
      onLongPress={() => {
        if (!editMode) {
          toggleSavedSession(item.id);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={editMode ? undefined : t('a11y.conversations.card_hint')}
    >
      <View style={styles.cardRow}>
        {editMode ? (
          <View style={styles.checkboxContainer}>
            <Ionicons
              name={selectedIds.has(item.id) ? 'checkbox' : 'square-outline'}
              size={24}
              color={selectedIds.has(item.id) ? theme.primary : theme.textSecondary}
            />
          </View>
        ) : null}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title}</Text>
          <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.subtitle}</Text>
          <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.timeLabel}</Text>
          <Text style={[styles.cardTags, { color: theme.primary }]}>
            {t('conversations.message_count', { count: item.messageCount })}
          </Text>
          <Text style={[styles.savedHint, { color: theme.timestamp }]}>
            {savedSessionIds.includes(item.id)
              ? t('conversations.saved_hint')
              : t('conversations.unsaved_hint')}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SwipeableConversationCard
      editMode={editMode}
      onDelete={() => {
        confirmDeleteSingle(item.id);
      }}
    >
      {cardContent}
    </SwipeableConversationCard>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxContainer: {
    paddingTop: 2,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
  },
  cardTags: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  savedHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
  },
});
