import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { DashboardSessionCard } from '@/features/chat';
import { SwipeableConversationCard } from '@/features/conversation/ui/SwipeableConversationCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, fontSize } from '@/shared/ui/tokens';

interface ConversationItemProps {
  item: DashboardSessionCard;
  editMode: boolean;
  selectedIds: ReadonlySet<string>;
  savedSessionIds: string[];
  toggleSelection: (id: string) => void;
  toggleSavedSession: (id: string) => void;
  confirmDeleteSingle: (id: string) => void;
}

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
  const title = item.title ?? t('conversations.untitled');

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
      accessibilityLabel={title}
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
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{title}</Text>
          {item.subtitle ? (
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.subtitle}</Text>
          ) : null}
          {item.timeLabel ? (
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.timeLabel}</Text>
          ) : null}
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
    borderRadius: semantic.card.paddingLarge,
    borderWidth: semantic.input.borderWidth,
    padding: space['3.5'],
    gap: semantic.card.gapTiny,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: semantic.form.gap,
  },
  checkboxContainer: {
    paddingTop: space['0.5'],
  },
  cardContent: {
    flex: 1,
    gap: semantic.card.gapTiny,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: semantic.form.labelSize,
  },
  cardTags: {
    marginTop: space['1'],
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
  },
  savedHint: {
    marginTop: space['1.5'],
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '600',
  },
});
