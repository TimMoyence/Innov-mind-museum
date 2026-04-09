import { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize } from '@/shared/ui/tokens.generated';

interface MenuAction {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface MessageContextMenuProps {
  /** The message for which the menu is shown. `null` hides the menu. */
  message: ChatUiMessage | null;
  onCopy: (message: ChatUiMessage) => void;
  onShare: (message: ChatUiMessage) => void;
  onReport: (messageId: string) => void;
  onClose: () => void;
}

/** Bottom-sheet style context menu for chat message actions. */
export const MessageContextMenu = ({
  message,
  onCopy,
  onShare,
  onReport,
  onClose,
}: MessageContextMenuProps) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();

  const handleAction = useCallback(
    (action: () => void) => {
      void Haptics.selectionAsync();
      action();
      onClose();
    },
    [onClose],
  );

  if (!message) return null;

  const isAssistant = message.role === 'assistant';

  const actions: MenuAction[] = [
    ...(message.text
      ? [
          {
            id: 'copy',
            icon: 'copy-outline' as const,
            label: t('messageMenu.copy'),
            onPress: () => {
              handleAction(() => {
                onCopy(message);
              });
            },
          },
          {
            id: 'share',
            icon: 'share-outline' as const,
            label: t('conversations.share'),
            onPress: () => {
              handleAction(() => {
                onShare(message);
              });
            },
          },
        ]
      : []),
    ...(isAssistant
      ? [
          {
            id: 'report',
            icon: 'flag-outline' as const,
            label: t('messageMenu.report'),
            onPress: () => {
              handleAction(() => {
                onReport(message.id);
              });
            },
          },
        ]
      : []),
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}
        onPress={onClose}
        accessibilityLabel={t('a11y.contextMenu.overlay_hint')}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: isDark ? theme.glassBackground : theme.primaryContrast },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.cardBorder }]} />
          <Text style={[styles.title, { color: theme.textSecondary }]} numberOfLines={1}>
            {message.text.slice(0, 60) || t('chat.voice_message')}
          </Text>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              style={[styles.action, { borderBottomColor: theme.separator }]}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon} size={20} color={theme.textPrimary} />
              <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>{action.label}</Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.cancelAction}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.contextMenu.cancel')}
          >
            <Text style={[styles.cancelLabel, { color: theme.textSecondary }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: semantic.card.radius,
    borderTopRightRadius: semantic.card.radius,
    paddingHorizontal: semantic.modal.padding,
    paddingTop: semantic.card.paddingCompact,
    paddingBottom: space['9'],
  },
  handle: {
    alignSelf: 'center',
    width: space['9'],
    height: space['1'],
    borderRadius: space['0.5'],
    marginBottom: semantic.screen.gap,
  },
  title: {
    fontSize: semantic.form.labelSize,
    marginBottom: semantic.card.gap,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
    paddingVertical: space['3.5'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  cancelAction: {
    marginTop: semantic.card.gap,
    alignItems: 'center',
    paddingVertical: space['3.5'],
  },
  cancelLabel: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
