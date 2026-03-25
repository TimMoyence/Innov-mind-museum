'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import type { DashboardStats } from '@/lib/admin-types';

interface StatCardDef {
  labelKey: string;
  valueKey: keyof DashboardStats;
  color: string;
}

const STAT_CARDS: StatCardDef[] = [
  { labelKey: 'totalUsers', valueKey: 'totalUsers', color: 'bg-primary-50 text-primary-700' },
  { labelKey: 'activeUsers', valueKey: 'activeUsers', color: 'bg-green-50 text-green-700' },
  { labelKey: 'conversations', valueKey: 'totalConversations', color: 'bg-accent-400/10 text-accent-600' },
  { labelKey: 'messages', valueKey: 'totalMessages', color: 'bg-purple-50 text-purple-700' },
  { labelKey: 'newToday', valueKey: 'newUsersToday', color: 'bg-amber-50 text-amber-700' },
  { labelKey: 'messagesThisWeek', valueKey: 'messagesThisWeek', color: 'bg-rose-50 text-rose-700' },
];

/** Stat card display labels — keyed for i18n (fallback English). */
const STAT_LABELS: Record<string, { en: string; fr: string }> = {
  totalUsers: { en: 'Total Users', fr: 'Utilisateurs totaux' },
  activeUsers: { en: 'Active Users', fr: 'Utilisateurs actifs' },
  conversations: { en: 'Conversations', fr: 'Conversations' },
  messages: { en: 'Messages', fr: 'Messages' },
  newToday: { en: 'New Today', fr: "Nouveaux aujourd'hui" },
  messagesThisWeek: { en: 'Messages This Week', fr: 'Messages cette semaine' },
};

function getStatLabel(key: string, locale: string): string {
  const entry = STAT_LABELS[key];
  if (!entry) return key;
  return locale === 'fr' ? entry.fr : entry.en;
}

export default function AdminDashboardPage() {
  const adminDict = useAdminDict();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Derive locale from dict (simple heuristic: dashboard label)
  const isFr = adminDict.dashboard === 'Tableau de bord';
  const locale = isFr ? 'fr' : 'en';

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const data = await apiGet<DashboardStats>('/api/admin/stats');
        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stats');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.dashboard}</h1>
      <p className="mt-1 text-text-secondary">
        {isFr ? 'Vue d\'ensemble de votre plateforme Musaium.' : 'Overview of your Musaium platform.'}
      </p>

      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      )}

      {stats && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STAT_CARDS.map((card) => (
            <div
              key={card.labelKey}
              className={`rounded-xl border border-primary-100 p-6 ${card.color}`}
            >
              <p className="text-sm font-medium opacity-80">
                {getStatLabel(card.labelKey, locale)}
              </p>
              <p className="mt-2 text-3xl font-bold">
                {stats[card.valueKey].toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
