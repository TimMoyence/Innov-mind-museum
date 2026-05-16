/**
 * B1 — Carnet (visit notebook) list screen.
 *
 * Groups past chat sessions by museum then date (descending). Reuses the
 * standard `<EmptyState>` / `<ErrorState>` / `<SkeletonConversationCard>`
 * surfaces — no new design tokens introduced.
 *
 * Spec : `docs/chat-ux-refonte/specs/B1.md` §1.2 R11-R17 ; §4 AC4-AC7.
 */

import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useVisitCarnet } from '@/features/chat/application/useVisitCarnet';
import { CarnetSessionCard } from '@/features/chat/ui/CarnetSessionCard';
import { BrandMark } from '@/shared/ui/BrandMark';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic } from '@/shared/ui/tokens';

const SKELETON_COUNT = 4;

/** Renders the carnet list screen with group sections and standard surface states. */
export default function CarnetListScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLoading, error, groups, refresh } = useVisitCarnet();
  const { startConversation } = useStartConversation();

  const handleCardPress = useCallback((id: string): void => {
    router.push(`/(stack)/carnet/${id}`);
  }, []);

  const handleStartConversation = useCallback((): void => {
    void startConversation({ intent: 'default' });
  }, [startConversation]);

  const handleRefresh = useCallback((): void => {
    void refresh();
  }, [refresh]);

  return (
    <LiquidScreen
      background={pickMuseumBackground(1)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + semantic.screen.gap },
        ]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.headerCard} intensity={60}>
          <BrandMark variant="header" />
          <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
            {t('carnet.title')}
          </Text>
        </GlassCard>

        {error !== null ? (
          <ErrorState variant="inline" title={error} testID="carnet-error-state" />
        ) : null}

        {isLoading ? (
          <View style={styles.section}>
            {Array.from({ length: SKELETON_COUNT }, (_, idx) => (
              <SkeletonConversationCard key={`carnet-skeleton-${String(idx)}`} />
            ))}
          </View>
        ) : null}

        {!isLoading && error === null && groups.length === 0 ? (
          <EmptyState
            variant="conversations"
            title={t('carnet.empty.title')}
            description={t('carnet.empty.description')}
            primaryAction={{
              label: t('empty.conversations.actionLabel'),
              onPress: handleStartConversation,
              iconName: 'chatbubble-outline',
            }}
            testID="carnet-empty-state"
          />
        ) : null}

        {!isLoading && error === null && groups.length > 0
          ? groups.map((group) => {
              const displayMuseumLabel =
                group.museumLabel === 'carnet.unknownMuseum'
                  ? t('carnet.unknownMuseum')
                  : group.museumLabel;
              return (
                <View key={group.museumKey} style={styles.section}>
                  <Text
                    style={[styles.sectionHeader, { color: theme.textSecondary }]}
                    accessibilityRole="header"
                  >
                    {displayMuseumLabel}
                  </Text>
                  {group.sessions.map((card) => (
                    <CarnetSessionCard key={card.id} card={card} onPress={handleCardPress} />
                  ))}
                </View>
              );
            })
          : null}
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
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    gap: semantic.card.gapSmall,
  },
  sectionHeader: {
    fontSize: semantic.section.subtitleSize,
    fontWeight: '700',
    marginBottom: semantic.card.gapTiny,
  },
});
