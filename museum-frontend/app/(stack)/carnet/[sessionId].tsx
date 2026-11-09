import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

import {
  buildVisitCarnetDetail,
  mapApiMessageToUiMessage,
  type ApiMessage,
  type ChatUiMessage,
  type VisitCarnetDetail,
} from '@/features/chat/application/chatSessionLogic.pure';
import { incrementCounter } from '@/features/chat/application/phase-telemetry';
import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorState } from '@/shared/ui/ErrorState';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

const SKELETON_COUNT = 3;
const THUMBNAIL_SIZE = semantic.chat.thumbnailSize;

export default function CarnetDetailScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = useMemo(() => params.sessionId || '', [params.sessionId]);

  const [isLoading, setIsLoading] = useState<boolean>(sessionId.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitCarnetDetail | null>(null);

  const cancelledRef = useRef(false);
  const telemetryEmittedRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (sessionId.length === 0) {
      return () => {
        cancelledRef.current = true;
      };
    }

    void (async () => {
      try {
        const response = await chatApi.getSession(sessionId);
        if (cancelledRef.current) return;

        const locale = i18n.language;
        const uiMessages: ChatUiMessage[] = response.messages.map((msg) =>
          mapApiMessageToUiMessage(msg as ApiMessage),
        );
        const next = buildVisitCarnetDetail(response.session, uiMessages, locale);
        setDetail(next);
        setIsLoading(false);
        if (!telemetryEmittedRef.current) {
          telemetryEmittedRef.current = true;
          incrementCounter('carnet_detail_viewed_total');
        }
      } catch (fetchError) {
        if (cancelledRef.current) return;
        setError(getErrorMessage(fetchError));
        setIsLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [sessionId]);

  const handleContinue = useCallback((): void => {
    incrementCounter('carnet_continue_pressed_total');
    router.push(`/(stack)/chat/${sessionId}`);
  }, [sessionId]);

  const handleBack = useCallback((): void => {
    router.back();
  }, []);

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + semantic.screen.gap },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {error !== null ? (
          <>
            <ErrorState
              variant="inline"
              title={error}
              onDismiss={handleBack}
              testID="carnet-detail-error-state"
            />
          </>
        ) : null}

        {isLoading ? (
          <View style={styles.section}>
            {Array.from({ length: SKELETON_COUNT }, (_, idx) => (
              <SkeletonConversationCard key={`carnet-detail-skeleton-${String(idx)}`} />
            ))}
          </View>
        ) : null}

        {!isLoading && error === null && detail ? (
          <>
            <GlassCard style={styles.headerCard} intensity={60}>
              <Text
                style={[styles.headerTitle, { color: theme.textPrimary }]}
                accessibilityRole="header"
                numberOfLines={2}
              >
                {detail.summary.museumName ?? t('carnet.unknownMuseum')}
              </Text>
              {detail.dateLabel ? (
                <Text style={[styles.headerMeta, { color: theme.textSecondary }]}>
                  {detail.dateLabel}
                </Text>
              ) : null}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={18} color={theme.primary} />
                  <Text style={[styles.statText, { color: theme.textPrimary }]}>
                    {detail.durationLabel === '0'
                      ? t('carnet.minutesShort_zero')
                      : t('carnet.minutesShort', { count: Number(detail.durationLabel) })}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="chatbubbles-outline" size={18} color={theme.primary} />
                  <Text style={[styles.statText, { color: theme.textPrimary }]}>
                    {t('carnet.messagesCount', { count: detail.summary.messageCount })}
                  </Text>
                </View>
              </View>
            </GlassCard>

            <View style={styles.section}>
              <Text
                style={[styles.sectionHeader, { color: theme.textSecondary }]}
                accessibilityRole="header"
              >
                {t('carnet.sectionArtworks')}
              </Text>
              {detail.summary.artworks.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                  {t('carnet.noArtworks')}
                </Text>
              ) : (
                detail.summary.artworks.map((artwork) => (
                  <View
                    key={artwork.title}
                    style={[styles.artworkRow, { borderBottomColor: theme.separator }]}
                  >
                    {artwork.imageUrl ? (
                      <Image
                        source={{ uri: artwork.imageUrl }}
                        style={styles.thumbnail}
                        accessibilityLabel={artwork.title}
                      />
                    ) : (
                      <View
                        style={[
                          styles.thumbnailPlaceholder,
                          { backgroundColor: theme.primaryTint },
                        ]}
                      >
                        <Ionicons name="image-outline" size={22} color={theme.textTertiary} />
                      </View>
                    )}
                    <View style={styles.artworkInfo}>
                      <Text
                        style={[styles.artworkTitle, { color: theme.textPrimary }]}
                        numberOfLines={1}
                      >
                        {artwork.title}
                      </Text>
                      {artwork.artist !== undefined && artwork.artist.length > 0 ? (
                        <Text
                          style={[styles.artworkDetail, { color: theme.textTertiary }]}
                          numberOfLines={1}
                        >
                          {artwork.artist}
                        </Text>
                      ) : null}
                      {artwork.room !== undefined && artwork.room.length > 0 ? (
                        <Text
                          style={[styles.artworkDetail, { color: theme.textTertiary }]}
                          numberOfLines={1}
                        >
                          {artwork.room}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text
                style={[styles.sectionHeader, { color: theme.textSecondary }]}
                accessibilityRole="header"
              >
                {t('carnet.sectionTranscript')}
              </Text>
              {detail.transcript
                .filter((msg) => msg.role !== 'system')
                .map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.transcriptRow,
                      msg.role === 'user'
                        ? styles.transcriptRowUser
                        : styles.transcriptRowAssistant,
                      {
                        backgroundColor:
                          msg.role === 'user' ? theme.userBubble : theme.assistantBubble,
                        borderColor:
                          msg.role === 'user'
                            ? theme.userBubbleBorder
                            : theme.assistantBubbleBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.transcriptText,
                        { color: msg.role === 'user' ? theme.primaryContrast : theme.textPrimary },
                      ]}
                    >
                      {msg.text}
                    </Text>
                  </View>
                ))}
            </View>

            <Pressable
              onPress={handleContinue}
              style={({ pressed }) => [
                styles.continueButton,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.shadowColor,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('carnet.continueButton')}
              testID="carnet-continue-button"
            >
              <Text style={[styles.continueButtonText, { color: theme.primaryContrast }]}>
                {t('carnet.continueButton')}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.screen.padding,
  },
  scrollContent: {
    paddingTop: semantic.screen.gapSmall,
    gap: semantic.section.gap,
  },
  headerCard: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  headerMeta: {
    fontSize: fontSize.sm,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: semantic.screen.gap,
    marginTop: semantic.card.gapTiny,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
  },
  statText: {
    fontSize: fontSize.sm,
  },
  section: {
    gap: semantic.card.gapSmall,
  },
  sectionHeader: {
    fontSize: semantic.section.subtitleSize,
    fontWeight: '700',
    marginBottom: semantic.card.gapTiny,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  artworkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space['2.5'],
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.sm,
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkInfo: {
    flex: 1,
  },
  artworkTitle: {
    fontSize: fontSize['base-'],
    fontWeight: '600',
  },
  artworkDetail: {
    fontSize: fontSize.xs,
    marginTop: space['0.5'],
  },
  transcriptRow: {
    padding: semantic.chat.bubblePadding,
    borderRadius: semantic.chat.bubbleRadius,
    borderWidth: semantic.input.borderWidth,
    maxWidth: '92%',
  },
  transcriptRowUser: {
    alignSelf: 'flex-end',
  },
  transcriptRowAssistant: {
    alignSelf: 'flex-start',
  },
  transcriptText: {
    fontSize: semantic.chat.fontSize,
  },
  continueButton: {
    marginTop: semantic.section.gapTight,
    borderRadius: semantic.modal.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  continueButtonText: {
    fontSize: semantic.button.fontSizeLarge,
    fontWeight: '700',
  },
});
