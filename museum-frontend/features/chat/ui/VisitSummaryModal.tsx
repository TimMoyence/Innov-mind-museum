import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { useTheme } from '@/shared/ui/ThemeContext';

interface VisitSummaryModalProps {
  visible: boolean;
  summary: VisitSummary;
  onClose: () => void;
}

const THUMBNAIL_SIZE = 48;

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
    padding: 20,
  },
  card: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  artworkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 6,
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 6,
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
    fontSize: 12,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
  },
});
