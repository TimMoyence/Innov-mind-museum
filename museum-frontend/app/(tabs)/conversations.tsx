import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import {
  DashboardSessionCard,
  mapSessionsToDashboardCards,
} from '@/features/chat/domain/dashboard-session';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { storage } from '@/shared/infrastructure/storage';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

const SAVED_SESSIONS_KEY = 'dashboard.savedSessions';
type SortMode = 'recent' | 'messages';

export default function ConversationsScreen() {
  const [items, setItems] = useState<DashboardSessionCard[]>([]);
  const [savedSessionIds, setSavedSessionIds] = useState<string[]>([]);
  const [isSavedOnly, setIsSavedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      const response = await chatApi.listSessions({ limit: 50 });
      const mapped = mapSessionsToDashboardCards(response.sessions, settings.defaultLocale);
      setItems(mapped);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
          ? 'Sorted by recency'
          : 'Sorted by message count',
      );
      return next;
    });
  };

  const toggleSavedFilter = () => {
    setIsSavedOnly((previous) => {
      const next = !previous;
      setMenuStatus(next ? 'Showing saved sessions only' : 'Showing all sessions');
      return next;
    });
  };

  const shareDashboard = async () => {
    const total = items.length;
    const savedCount = savedSessionIds.length;
    await Share.share({
      title: 'Musaium dashboard',
      message: `Musaium dashboard: ${total} sessions, ${savedCount} saved.`,
    });
    setMenuStatus('Dashboard summary shared');
  };

  const toggleSavedSession = async (sessionId: string) => {
    const exists = savedSessionIds.includes(sessionId);
    const nextSaved = exists
      ? savedSessionIds.filter((id) => id !== sessionId)
      : [...savedSessionIds, sessionId];

    await persistSavedSessions(nextSaved);
    setMenuStatus(exists ? 'Session removed from saved' : 'Session saved');
  };

  const visibleItems = useMemo(() => {
    const filtered = isSavedOnly
      ? items.filter((item) => savedSessionIds.includes(item.id))
      : items;

    if (sortMode === 'recent') {
      return filtered;
    }

    return [...filtered].sort(
      (left, right) => right.messageCount - left.messageCount,
    );
  }, [isSavedOnly, items, savedSessionIds, sortMode]);

  return (
    <LiquidScreen background={pickMuseumBackground(2)} contentStyle={styles.screen}>
      <View style={styles.menuRow}>
        <FloatingContextMenu
          actions={[
            { id: 'sort', icon: 'filter-outline', label: 'Filter', onPress: toggleSortMode },
            { id: 'bookmark', icon: 'bookmark-outline', label: 'Saved', onPress: toggleSavedFilter },
            { id: 'share', icon: 'share-social-outline', label: 'Share', onPress: () => void shareDashboard() },
          ]}
        />
      </View>

      <GlassCard style={styles.headerCard} intensity={60}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Your recent museum sessions. Pull down to refresh.</Text>
        <Text style={styles.metaLine}>
          {isSavedOnly ? 'Saved filter ON' : 'Saved filter OFF'} • sort: {sortMode}
        </Text>
      </GlassCard>

      {menuStatus ? <Text style={styles.menuStatus}>{menuStatus}</Text> : null}

      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

      <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/home')}>
        <Text style={styles.primaryButtonText}>Start New Conversation</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator color={liquidColors.primary} size='large' />
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
          ListEmptyComponent={
            <GlassCard style={styles.emptyState} intensity={48}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                {isSavedOnly
                  ? 'No saved sessions yet. Long-press a session to save it.'
                  : 'Start a new conversation from Home to create your first session.'}
              </Text>
            </GlassCard>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/(stack)/chat/${item.id}`)}
              onLongPress={() => {
                void toggleSavedSession(item.id);
              }}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.subtitle}</Text>
              <Text style={styles.cardMeta}>{item.timeLabel}</Text>
              <Text style={styles.cardTags}>Messages: {item.messageCount}</Text>
              <Text style={styles.savedHint}>
                {savedSessionIds.includes(item.id) ? 'Saved • hold to unsave' : 'Hold to save'}
              </Text>
            </Pressable>
          )}
        />
      )}
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingTop: 56,
  },
  menuRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: liquidColors.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    color: liquidColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  metaLine: {
    marginTop: 6,
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '700',
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
    backgroundColor: liquidColors.primary,
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
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: liquidColors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    color: liquidColors.textSecondary,
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
    color: liquidColors.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    color: '#475569',
  },
  cardTags: {
    marginTop: 4,
    fontSize: 12,
    color: liquidColors.primary,
    fontWeight: '700',
  },
  savedHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
});
