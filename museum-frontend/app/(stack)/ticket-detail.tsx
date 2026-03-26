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
import type { components } from '@/shared/api/generated/openapi';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type TicketDetailDTO = components['schemas']['TicketDetailDTO'];
type TicketMessageDTO = components['schemas']['TicketMessageDTO'];
type TicketStatus = TicketDetailDTO['status'];

const statusColor = (status: TicketStatus): string => {
  switch (status) {
    case 'open': return '#3B82F6';
    case 'in_progress': return '#F59E0B';
    case 'resolved': return '#22C55E';
    case 'closed': return '#6B7280';
  }
};

const priorityColor = (priority: TicketDetailDTO['priority']): string => {
  switch (priority) {
    case 'low': return '#6B7280';
    case 'medium': return '#F59E0B';
    case 'high': return '#EF4444';
  }
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

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
            isVisitor
              ? { alignSelf: 'flex-start', backgroundColor: theme.assistantBubble, borderColor: theme.assistantBubbleBorder }
              : { alignSelf: 'flex-end', backgroundColor: theme.userBubble, borderColor: theme.userBubbleBorder },
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
              { color: isVisitor ? theme.textSecondary : 'rgba(255,255,255,0.7)' },
            ]}
          >
            {formatDate(item.createdAt)}
          </Text>
        </View>
      );
    },
    [theme],
  );

  if (isLoading) {
    return (
      <LiquidScreen background={pickMuseumBackground(3)} contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </LiquidScreen>
    );
  }

  if (error && !ticket) {
    return (
      <LiquidScreen background={pickMuseumBackground(3)} contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <ErrorNotice message={error} onDismiss={() => { setError(null); }} />
      </LiquidScreen>
    );
  }

  return (
    <LiquidScreen background={pickMuseumBackground(3)} contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}>
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
                {t('tickets.created')}: {formatDate(ticket.createdAt)}
              </Text>
              {ticket.category ? (
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  {ticket.category}
                </Text>
              ) : null}
            </GlassCard>

            {error ? <ErrorNotice message={error} onDismiss={() => { setError(null); }} /> : null}

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

            <View style={[styles.replyBar, { borderTopColor: theme.separator, backgroundColor: theme.cardBackground }]}>
              <TextInput
                style={[styles.replyInput, { color: theme.textPrimary, backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
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

const msgSepStyle = { height: 8 } as const;
const MessageSeparator = () => <View style={msgSepStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  flex: {
    flex: 1,
  },
  headerCard: {
    padding: 16,
    gap: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  meta: {
    fontSize: 12,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  emptyMessages: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
  },
  replyInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
