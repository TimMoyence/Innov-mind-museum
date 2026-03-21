import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import {
  DashboardSessionCard,
  mapSessionsToDashboardCards,
} from '@/features/chat/domain/dashboard-session';
import { ConversationSearchBar } from '@/features/conversation/ui/ConversationSearchBar';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { storage } from '@/shared/infrastructure/storage';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { SkeletonConversationCard } from '@/shared/ui/SkeletonConversationCard';

const SAVED_SESSIONS_KEY = 'dashboard.savedSessions';
type SortMode = 'recent' | 'messages';

/** Renders the dashboard screen listing recent chat sessions with sort, save, and share capabilities. */
export default function ConversationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [items, setItems] = useState<DashboardSessionCard[]>([]);
  const [savedSessionIds, setSavedSessionIds] = useState<string[]>([]);
  const [isSavedOnly, setIsSavedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menuStatus, setMenuStatus] = useState('');

  useEffect(() => {
    storage
      .getJSON<string[]>(SAVED_SESSIONS_KEY)
      .then((saved) => {
        if (Array.isArray(saved)) {
          setSavedSessionIds(saved.filter((id) => typeof id === 'string'));
        }
      })
      .catch(() => {
        // keep runtime fallback when storage is unavailable
      });
  }, []);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.listSessions({ limit: 20 });
      const mapped = mapSessionsToDashboardCards(response.sessions, settings.defaultLocale);
      setItems(mapped);
      setNextCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.listSessions({ limit: 20, cursor: nextCursor });
      const mapped = mapSessionsToDashboardCards(response.sessions, settings.defaultLocale);
      setItems((prev) => [...prev, ...mapped]);
      setNextCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
    } catch {
      // Silently fail — user can scroll again
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const persistSavedSessions = async (nextSaved: string[]) => {
    setSavedSessionIds(nextSaved);
    await storage.setJSON(SAVED_SESSIONS_KEY, nextSaved);
  };

  const toggleSortMode = () => {
    setSortMode((previous) => {
      const next = previous === 'recent' ? 'messages' : 'recent';
      setMenuStatus(
        next === 'recent'
          ? t('conversations.sorted_by_recency')
          : t('conversations.sorted_by_messages'),
      );
      return next;
    });
  };

  const toggleSavedFilter = () => {
    setIsSavedOnly((previous) => {
      const next = !previous;
      setMenuStatus(next ? t('conversations.showing_saved_only') : t('conversations.showing_all'));
      return next;
    });
  };

  const shareDashboard = async () => {
    const total = items.length;
    const savedCount = savedSessionIds.length;
    await Share.share({
      title: t('conversations.share_title'),
      message: t('conversations.share_body', { total, savedCount }),
    });
    setMenuStatus(t('conversations.shared_success'));
  };

  const toggleSavedSession = async (sessionId: string) => {
    const exists = savedSessionIds.includes(sessionId);
    const nextSaved = exists
      ? savedSessionIds.filter((id) => id !== sessionId)
      : [...savedSessionIds, sessionId];

    await persistSavedSessions(nextSaved);
    setMenuStatus(exists ? t('conversations.session_unsaved') : t('conversations.session_saved'));
  };

  const renderConversationItem = useCallback(
    ({ item }: { item: DashboardSessionCard }) => (
      <Pressable
        style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground }]}
        onPress={() => router.push(`/(stack)/chat/${item.id}`)}
        onLongPress={() => {
          void toggleSavedSession(item.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityHint={t('a11y.conversations.card_hint')}
      >
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title}</Text>
        <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.subtitle}</Text>
        <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{item.timeLabel}</Text>
        <Text style={[styles.cardTags, { color: theme.primary }]}>{t('conversations.message_count', { count: item.messageCount })}</Text>
        <Text style={[styles.savedHint, { color: theme.textSecondary }]}>
          {savedSessionIds.includes(item.id) ? t('conversations.saved_hint') : t('conversations.unsaved_hint')}
        </Text>
      </Pressable>
    ),
    [theme, savedSessionIds, t, toggleSavedSession, router],
  );

  const visibleItems = useMemo(() => {
    let filtered = isSavedOnly
      ? items.filter((item) => savedSessionIds.includes(item.id))
      : items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.subtitle.toLowerCase().includes(query),
      );
    }

    if (sortMode === 'recent') {
      return filtered;
    }

    return [...filtered].sort(
      (left, right) => right.messageCount - left.messageCount,
    );
  }, [isSavedOnly, items, savedSessionIds, sortMode, searchQuery]);

  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.menuRow}>
        <FloatingContextMenu
          actions={[
            { id: 'sort', icon: 'filter-outline', label: t('conversations.filter'), onPress: toggleSortMode },
            { id: 'bookmark', icon: 'bookmark-outline', label: t('conversations.saved'), onPress: toggleSavedFilter },
            { id: 'share', icon: 'share-social-outline', label: t('conversations.share'), onPress: () => void shareDashboard() },
          ]}
        />
      </View>

      <GlassCard style={styles.headerCard} intensity={60}>
        <BrandMark variant='header' style={styles.brand} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('conversations.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('conversations.subtitle')}</Text>
        <Text style={[styles.metaLine, { color: theme.primary }]}>
          {isSavedOnly ? t('conversations.saved_filter_on') : t('conversations.saved_filter_off')} • {t('conversations.sort_label', { sortMode })}
        </Text>
      </GlassCard>

      {menuStatus ? <Text style={[styles.menuStatus, { color: theme.success }]}>{menuStatus}</Text> : null}

      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

      <ConversationSearchBar value={searchQuery} onChangeText={setSearchQuery} />

      <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={() => router.push('/(tabs)/home')} accessibilityRole="button" accessibilityLabel={t('a11y.conversations.start_new')}>
        <Text style={styles.primaryButtonText}>{t('conversations.start_new')}</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonConversationCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.3}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListFooterComponent={
            isLoadingMore ? <SkeletonConversationCard /> : null
          }
          ListEmptyComponent={
            <GlassCard style={styles.emptyState} intensity={48}>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{t('conversations.empty_title')}</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {isSavedOnly
                  ? t('conversations.empty_saved')
                  : t('conversations.empty_body')}
              </Text>
            </GlassCard>
          }
        />
      )}
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  menuRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  brand: {
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: undefined, // theme.textPrimary applied inline
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    color: undefined, // theme.textSecondary applied inline
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  metaLine: {
    marginTop: 6,
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '700',
    textAlign: 'center',
  },
  menuStatus: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    color: '#166534',
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: undefined, // theme.primary applied inline
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  skeletonList: {
    marginTop: 16,
    paddingBottom: 24,
  },
  listContent: {
    marginTop: 16,
    paddingBottom: 24,
    gap: 10,
  },
  emptyState: {
    marginTop: 28,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: undefined, // theme.textPrimary applied inline
  },
  emptySubtitle: {
    marginTop: 6,
    color: undefined, // theme.textSecondary applied inline
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.66)',
    padding: 14,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: undefined, // theme.textPrimary applied inline
  },
  cardMeta: {
    fontSize: 13,
    color: '#475569',
  },
  cardTags: {
    marginTop: 4,
    fontSize: 12,
    color: undefined, // theme.primary applied inline
    fontWeight: '700',
  },
  savedHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
});
