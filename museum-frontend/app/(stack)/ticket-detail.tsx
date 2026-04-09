import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ticketApi } from '@/features/support/infrastructure/ticketApi';
import {
  BADGE_TEXT_COLOR,
  statusColor,
  priorityColor,
  formatDateWithTime,
} from '@/features/support/ui/ticketHelpers';
import type { components } from '@/shared/api/generated/openapi';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize } from '@/shared/ui/tokens.generated';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

const STAFF_TIME_COLOR = 'rgba(255,255,255,0.7)';

type TicketDetailDTO = components['schemas']['TicketDetailDTO'];
type TicketMessageDTO = components['schemas']['TicketMessageDTO'];
type TicketStatus = TicketDetailDTO['status'];

/** Renders a ticket detail screen with message thread and reply input. */
export default function TicketDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ ticketId: string }>();
  const ticketId = params.ticketId;

  const [ticket, setTicket] = useState<TicketDetailDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList<TicketMessageDTO>>(null);

  const loadDetail = useCallback(async () => {
    if (!ticketId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await ticketApi.getTicketDetail(ticketId);
      setTicket(response.ticket);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleSend = async () => {
    if (!ticketId || !replyText.trim() || isSending) return;
    setIsSending(true);
    try {
      await ticketApi.addTicketMessage(ticketId, replyText.trim());
      setReplyText('');
      // Re-fetch to get updated messages
      const response = await ticketApi.getTicketDetail(ticketId);
      setTicket(response.ticket);
      // Scroll to bottom after a short delay to let the list render
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (sendError) {
      setError(getErrorMessage(sendError));
    } finally {
      setIsSending(false);
    }
  };

  const statusLabel = (s: TicketStatus): string => {
    const map: Record<TicketStatus, string> = {
      open: t('tickets.statusOpen'),
      in_progress: t('tickets.statusInProgress'),
      resolved: t('tickets.statusResolved'),
      closed: t('tickets.statusClosed'),
    };
    return map[s];
  };

  const renderMessage = useCallback(
    ({ item }: { item: TicketMessageDTO }) => {
      const isVisitor = item.senderRole === 'visitor';
      return (
        <View
          style={[
            styles.messageBubble,
            isVisitor ? styles.visitorBubble : styles.staffBubble,
            {
              backgroundColor: isVisitor ? theme.assistantBubble : theme.userBubble,
              borderColor: isVisitor ? theme.assistantBubbleBorder : theme.userBubbleBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              { color: isVisitor ? theme.textPrimary : theme.primaryContrast },
            ]}
          >
            {item.text}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isVisitor ? { color: theme.textSecondary } : styles.staffMessageTimeColor,
            ]}
          >
            {formatDateWithTime(item.createdAt)}
          </Text>
        </View>
      );
    },
    [theme],
  );

  if (isLoading) {
    return (
      <LiquidScreen
        background={pickMuseumBackground(3)}
        contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </LiquidScreen>
    );
  }

  if (error && !ticket) {
    return (
      <LiquidScreen
        background={pickMuseumBackground(3)}
        contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
      >
        <ErrorNotice
          message={error}
          onDismiss={() => {
            setError(null);
          }}
        />
      </LiquidScreen>
    );
  }

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 12}
      >
        {ticket ? (
          <>
            <GlassCard style={styles.headerCard} intensity={60}>
              <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
                {ticket.subject}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: statusColor(ticket.status) }]}>
                  <Text style={styles.badgeText}>{statusLabel(ticket.status)}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: priorityColor(ticket.priority) }]}>
                  <Text style={styles.badgeText}>{ticket.priority}</Text>
                </View>
              </View>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {t('tickets.created')}: {formatDateWithTime(ticket.createdAt)}
              </Text>
              {ticket.category ? (
                <Text style={[styles.meta, { color: theme.textSecondary }]}>{ticket.category}</Text>
              ) : null}
            </GlassCard>

            {error ? (
              <ErrorNotice
                message={error}
                onDismiss={() => {
                  setError(null);
                }}
              />
            ) : null}

            <FlatList
              ref={flatListRef}
              data={ticket.messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageList}
              style={styles.flex}
              ListEmptyComponent={
                <Text style={[styles.emptyMessages, { color: theme.textSecondary }]}>
                  {t('tickets.noMessages')}
                </Text>
              }
              ItemSeparatorComponent={MessageSeparator}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToEnd({ animated: false });
              }}
            />

            <View
              style={[
                styles.replyBar,
                { borderTopColor: theme.separator, backgroundColor: theme.cardBackground },
              ]}
            >
              <TextInput
                style={[
                  styles.replyInput,
                  {
                    color: theme.textPrimary,
                    backgroundColor: theme.inputBackground,
                    borderColor: theme.inputBorder,
                  },
                ]}
                value={replyText}
                onChangeText={setReplyText}
                placeholder={t('tickets.replyPlaceholder')}
                placeholderTextColor={theme.placeholderText}
                multiline
                maxLength={2000}
                editable={!isSending}
              />
              <Pressable
                style={[
                  styles.sendButton,
                  { backgroundColor: replyText.trim() ? theme.primary : theme.cardBorder },
                ]}
                onPress={() => void handleSend()}
                disabled={!replyText.trim() || isSending}
                accessibilityRole="button"
                accessibilityLabel={t('tickets.send')}
              >
                <Text style={[styles.sendButtonText, { color: theme.primaryContrast }]}>
                  {isSending ? t('tickets.sending') : t('tickets.send')}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>
    </LiquidScreen>
  );
}

const msgSepStyle = { height: semantic.chat.gap } as const;
const MessageSeparator = () => <View style={msgSepStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
  },
  flex: {
    flex: 1,
  },
  headerCard: {
    padding: semantic.card.padding,
    gap: semantic.list.itemGapSmall,
    marginBottom: semantic.card.gapSmall,
  },
  title: {
    fontSize: semantic.section.titleSize,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: semantic.card.gapSmall,
  },
  badge: {
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingYTight,
    borderRadius: semantic.badge.radius,
  },
  badgeText: {
    color: BADGE_TEXT_COLOR,
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  meta: {
    fontSize: fontSize.xs,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingVertical: semantic.chat.bubblePadding,
    paddingHorizontal: space['1'],
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: semantic.chat.bubbleRadius,
    borderWidth: semantic.input.borderWidth,
    padding: semantic.chat.bubblePadding,
    gap: semantic.card.gapTiny,
  },
  visitorBubble: {
    alignSelf: 'flex-start',
  },
  staffBubble: {
    alignSelf: 'flex-end',
  },
  messageText: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  messageTime: {
    fontSize: space['2.5'],
    alignSelf: 'flex-end',
  },
  staffMessageTimeColor: {
    color: STAFF_TIME_COLOR,
  },
  emptyMessages: {
    textAlign: 'center',
    marginTop: semantic.screen.paddingLarge,
    fontSize: fontSize.sm,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: semantic.chat.gap,
    paddingVertical: space['2.5'],
    paddingHorizontal: space['1'],
    borderTopWidth: semantic.input.borderWidth,
  },
  replyInput: {
    flex: 1,
    borderRadius: semantic.input.radius,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: space['2.5'],
    fontSize: fontSize.sm,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: semantic.input.radius,
    paddingHorizontal: semantic.card.padding,
    paddingVertical: space['2.5'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
});
