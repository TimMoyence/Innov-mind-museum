import { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import { useTheme } from '@/shared/ui/ThemeContext';

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
            onPress: () => handleAction(() => onCopy(message)),
          },
          {
            id: 'share',
            icon: 'share-outline' as const,
            label: t('conversations.share'),
            onPress: () => handleAction(() => onShare(message)),
          },
        ]
      : []),
    ...(isAssistant
      ? [
          {
            id: 'report',
            icon: 'flag-outline' as const,
            label: t('messageMenu.report'),
            onPress: () => handleAction(() => onReport(message.id)),
          },
        ]
      : []),
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.textSecondary }]} numberOfLines={1}>
            {message.text?.slice(0, 60) || t('chat.voice_message')}
          </Text>
          {actions.map((action) => (
            <Pressable key={action.id} style={styles.action} onPress={action.onPress}>
              <Ionicons name={action.icon} size={20} color={theme.textPrimary} />
              <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>{action.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelAction} onPress={onClose}>
            <Text style={[styles.cancelLabel, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.4)',
    marginBottom: 16,
  },
  title: {
    fontSize: 13,
    marginBottom: 12,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.25)',
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelAction: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
