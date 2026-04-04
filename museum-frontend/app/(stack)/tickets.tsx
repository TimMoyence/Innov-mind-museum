import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
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

const BADGE_TEXT_COLOR = '#FFFFFF';

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

const statusColor = (status: TicketStatus, theme: ReturnType<typeof useTheme>['theme']): string => {
  switch (status) {
    case 'open':
      return '#3B82F6';
    case 'in_progress':
      return '#F59E0B';
    case 'resolved':
      return theme.success;
    case 'closed':
      return theme.textSecondary;
  }
};

const priorityColor = (
  priority: TicketDTO['priority'],
  theme: ReturnType<typeof useTheme>['theme'],
): string => {
  switch (priority) {
    case 'low':
      return theme.textSecondary;
    case 'medium':
      return '#F59E0B';
    case 'high':
      return theme.danger;
  }
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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
          <View style={[styles.badge, { backgroundColor: statusColor(item.status, theme) }]}>
            <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: priorityColor(item.priority, theme) }]}>
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

const separatorStyle = { height: 10 } as const;
const ItemSeparator = () => <View style={separatorStyle} />;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  loadingWrap: {
    marginTop: 40,
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
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
    color: BADGE_TEXT_COLOR,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMeta: {
    fontSize: 12,
  },
  emptyState: {
    marginTop: 28,
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    lineHeight: 20,
    fontSize: 14,
  },
  emptyButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  footerLoader: {
    marginVertical: 16,
  },
});
