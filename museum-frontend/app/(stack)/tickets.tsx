import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ticketApi } from '@/features/support/infrastructure/ticketApi';
import {
  BADGE_TEXT_COLOR,
  statusColor,
  priorityColor,
  formatDate,
} from '@/features/support/ui/ticketHelpers';
import type { components } from '@/shared/api/generated/openapi';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, radius, fontSize } from '@/shared/ui/tokens.generated';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type TicketDTO = components['schemas']['TicketDTO'];
type TicketStatus = TicketDTO['status'];

const STATUS_OPTIONS: (TicketStatus | 'all')[] = [
  'all',
  'open',
  'in_progress',
  'resolved',
  'closed',
];

const PAGE_LIMIT = 15;

/** Renders the paginated ticket list screen with status filter pills, FAB to create, and navigation to detail. */
export default function TicketsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  const loadTickets = useCallback(
    async (requestedPage: number, isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (requestedPage === 1) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await ticketApi.listTickets({
          page: requestedPage,
          limit: PAGE_LIMIT,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        if (requestedPage === 1) {
          setTickets(response.data);
        } else {
          setTickets((prev) => [...prev, ...response.data]);
        }
        setPage(response.page);
        setTotalPages(response.totalPages);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        if (requestedPage === 1) {
          setTickets([]);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [statusFilter],
  );

  const loadMore = useCallback(async () => {
    if (page >= totalPages || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await ticketApi.listTickets({
        page: nextPage,
        limit: PAGE_LIMIT,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setTickets((prev) => [...prev, ...response.data]);
      setPage(response.page);
      setTotalPages(response.totalPages);
    } catch {
      // Silently fail — user can scroll again
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [page, totalPages, statusFilter]);

  useEffect(() => {
    void loadTickets(1);
  }, [loadTickets]);

  const handleStatusFilter = useCallback((newStatus: TicketStatus | 'all') => {
    setStatusFilter(newStatus);
    setPage(1);
  }, []);

  const statusLabel = useCallback(
    (s: TicketStatus | 'all'): string => {
      if (s === 'all') return t('tickets.status');
      const map: Record<TicketStatus, string> = {
        open: t('tickets.statusOpen'),
        in_progress: t('tickets.statusInProgress'),
        resolved: t('tickets.statusResolved'),
        closed: t('tickets.statusClosed'),
      };
      return map[s];
    },
    [t],
  );

  const renderTicketItem = useCallback(
    ({ item }: { item: TicketDTO }) => (
      <Pressable
        style={[
          styles.card,
          { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
        ]}
        onPress={() => {
          router.push({ pathname: '/(stack)/ticket-detail', params: { ticketId: item.id } });
        }}
        accessibilityRole="button"
        accessibilityLabel={item.subject}
      >
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.subject}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
            <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: priorityColor(item.priority) }]}>
            <Text style={styles.badgeText}>{item.priority}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
            {formatDate(item.createdAt)}
          </Text>
          {item.messageCount !== undefined && (
            <Text style={[styles.cardMeta, { color: theme.primary }]}>
              {t('tickets.messages')}: {String(item.messageCount)}
            </Text>
          )}
        </View>
      </Pressable>
    ),
    [theme, t, statusLabel],
  );

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <GlassCard style={styles.headerCard} intensity={60}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('tickets.title')}</Text>
      </GlassCard>

      <View style={styles.filterRow}>
        {STATUS_OPTIONS.map((s) => (
          <Pressable
            key={s}
            style={[
              styles.filterPill,
              {
                backgroundColor: statusFilter === s ? theme.primary : theme.cardBackground,
                borderColor: statusFilter === s ? theme.primary : theme.cardBorder,
              },
            ]}
            onPress={() => {
              handleStatusFilter(s);
            }}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.filterPillText,
                { color: statusFilter === s ? theme.primaryContrast : theme.textPrimary },
              ]}
            >
              {statusLabel(s)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <ErrorNotice
          message={error}
          onDismiss={() => {
            setError(null);
          }}
        />
      ) : null}

      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
        ]}
        onPress={() => {
          router.push('/(stack)/create-ticket');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('tickets.create')}
      >
        <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
          {t('tickets.create')}
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          renderItem={renderTicketItem}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void loadTickets(1, true)}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerLoader} size="small" color={theme.primary} />
            ) : null
          }
          ListEmptyComponent={
            <GlassCard style={styles.emptyState} intensity={48}>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                {t('tickets.noTickets')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {t('tickets.noTicketsDesc')}
              </Text>
              <Pressable
                style={[styles.emptyButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  router.push('/(stack)/create-ticket');
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.emptyButtonText, { color: theme.primaryContrast }]}>
                  {t('tickets.createFirst')}
                </Text>
              </Pressable>
            </GlassCard>
          }
          ItemSeparatorComponent={ItemSeparator}
        />
      )}
    </LiquidScreen>
  );
}

const separatorStyle = { height: space['2.5'] } as const;
const ItemSeparator = () => <View style={separatorStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
  },
  headerCard: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.padding,
    alignItems: 'center',
  },
  title: {
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: semantic.card.gapSmall,
    marginTop: semantic.screen.gapSmall,
    marginBottom: space['1'],
  },
  filterPill: {
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.section.gapTight,
    borderRadius: radius['2xl'],
    borderWidth: semantic.input.borderWidth,
  },
  filterPillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: semantic.screen.gapSmall,
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  loadingWrap: {
    marginTop: space['10'],
    alignItems: 'center',
  },
  listContent: {
    paddingTop: semantic.card.padding,
    paddingBottom: semantic.screen.paddingLarge,
  },
  card: {
    borderRadius: semantic.card.titleSize,
    borderWidth: semantic.input.borderWidth,
    padding: space['3.5'],
    gap: semantic.list.itemGapSmall,
  },
  cardTitle: {
    fontSize: fontSize['base-'],
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMeta: {
    fontSize: fontSize.xs,
  },
  emptyState: {
    marginTop: semantic.screen.paddingXL,
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  emptySubtitle: {
    lineHeight: space['5'],
    fontSize: fontSize.sm,
  },
  emptyButton: {
    marginTop: semantic.card.gapSmall,
    borderRadius: semantic.button.radiusSmall,
    paddingVertical: space['2.5'],
    alignItems: 'center',
  },
  emptyButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  footerLoader: {
    marginVertical: semantic.card.padding,
  },
});
