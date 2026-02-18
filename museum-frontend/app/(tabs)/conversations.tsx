import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';

export default function ConversationsScreen() {
  const [items, setItems] = useState<DashboardSessionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const mapped = mapSessionsToDashboardCards(
        response.sessions,
        settings.defaultLocale,
      );
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>
        Your recent museum chat sessions. Pull down to refresh.
      </Text>

      {error ? (
        <ErrorNotice message={error} onDismiss={() => setError(null)} />
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/(tabs)/home')}
        >
          <Text style={styles.primaryButtonText}>Start New Conversation</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator color='#0F766E' size='large' />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a new conversation from Home to create your first session.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/(stack)/chat/${item.id}`)}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.subtitle}</Text>
              <Text style={styles.cardMeta}>{item.timeLabel}</Text>
              <Text style={styles.cardTags}>
                Messages: {item.messageCount}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 18,
    paddingTop: 56,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0F766E',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    marginTop: 16,
    paddingBottom: 22,
    gap: 10,
  },
  emptyState: {
    marginTop: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  emptySubtitle: {
    marginTop: 6,
    color: '#475569',
    lineHeight: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardMeta: {
    fontSize: 13,
    color: '#475569',
  },
  cardTags: {
    marginTop: 4,
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
  },
});
