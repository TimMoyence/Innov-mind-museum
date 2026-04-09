import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, radius, fontSize } from '@/shared/ui/tokens.generated';

interface VisitSummaryModalProps {
  visible: boolean;
  summary: VisitSummary;
  onClose: () => void;
}

const THUMBNAIL_SIZE = semantic.chat.thumbnailSize;

/** Modal that displays an aggregated summary of a museum visit session. */
export const VisitSummaryModal = React.memo(function VisitSummaryModal({
  visible,
  summary,
  onClose,
}: VisitSummaryModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.modalOverlay }]}>
        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleArea}>
              <Ionicons name="document-text-outline" size={22} color={theme.primary} />
              <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                {summary.museumName ?? t('visitSummary.visitSummary')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={12}
            >
              <Ionicons name="close-circle" size={28} color={theme.textTertiary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Artworks section */}
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('visitSummary.artworksDiscussed')}
            </Text>
            {summary.artworks.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                {t('visitSummary.noArtworks')}
              </Text>
            ) : (
              summary.artworks.map((artwork) => (
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
                      style={[styles.thumbnailPlaceholder, { backgroundColor: theme.primaryTint }]}
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
                    {artwork.artist ? (
                      <Text
                        style={[styles.artworkDetail, { color: theme.textTertiary }]}
                        numberOfLines={1}
                      >
                        {artwork.artist}
                      </Text>
                    ) : null}
                    {artwork.room ? (
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

            {/* Rooms visited */}
            {summary.roomsVisited.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                  {t('visitSummary.roomsVisited')}
                </Text>
                <View style={styles.chipRow}>
                  {summary.roomsVisited.map((room) => (
                    <View
                      key={room}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: theme.primaryTint,
                          borderColor: theme.primaryBorderSubtle,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: theme.primary }]}>{room}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Stats */}
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {t('visitSummary.visitDuration')}
            </Text>
            <View style={styles.statsRow}>
              <StatItem
                icon="time-outline"
                label={`${String(summary.duration.minutes)} min`}
                color={theme.textPrimary}
                iconColor={theme.primary}
              />
              <StatItem
                icon="chatbubbles-outline"
                label={`${String(summary.messageCount)} ${t('visitSummary.messages')}`}
                color={theme.textPrimary}
                iconColor={theme.primary}
              />
              {summary.expertiseLevel ? (
                <StatItem
                  icon="school-outline"
                  label={`${t('visitSummary.expertiseLevel')}: ${summary.expertiseLevel}`}
                  color={theme.textPrimary}
                  iconColor={theme.primary}
                />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
});

function StatItem({
  icon,
  label,
  color,
  iconColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  iconColor: string;
}) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={[styles.statText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: semantic.modal.padding,
  },
  card: {
    width: '100%',
    maxHeight: semantic.modal.maxHeight,
    borderRadius: semantic.modal.radius,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: semantic.screen.padding,
    paddingVertical: space['3.5'],
  },
  headerTitleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gap,
    marginRight: semantic.card.gap,
  },
  title: {
    fontSize: semantic.card.titleSize,
    fontWeight: '700',
    flexShrink: 1,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: semantic.screen.padding,
    paddingBottom: semantic.modal.padding,
  },
  sectionTitle: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: semantic.screen.padding,
    marginBottom: semantic.section.gapSmall,
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
    fontSize: 15,
    fontWeight: '600',
  },
  artworkDetail: {
    fontSize: fontSize.xs,
    marginTop: space['0.5'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: semantic.chat.gap,
  },
  chip: {
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.chat.gapSmall,
    borderRadius: semantic.chat.bubbleRadius,
    borderWidth: semantic.input.borderWidth,
  },
  chipText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: semantic.screen.gap,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
  },
  statText: {
    fontSize: fontSize.sm,
  },
});
