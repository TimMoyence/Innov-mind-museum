'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import type { Dictionary } from '@/lib/i18n';
import type { AdminStats } from '@/lib/admin-types';

type StatLabelKey = keyof Dictionary['admin']['dashboardPage']['stats'];

interface StatCardDef {
  labelKey: StatLabelKey;
  valueKey: keyof AdminStats;
  color: string;
}

const STAT_CARDS: StatCardDef[] = [
  { labelKey: 'totalUsers', valueKey: 'totalUsers', color: 'bg-primary-50 text-primary-700' },
  {
    labelKey: 'totalSessions',
    valueKey: 'totalSessions',
    color: 'bg-green-50 text-green-700',
  },
  {
    labelKey: 'totalMessages',
    valueKey: 'totalMessages',
    color: 'bg-accent-400/10 text-accent-600',
  },
  {
    labelKey: 'recentSignups',
    valueKey: 'recentSignups',
    color: 'bg-amber-50 text-amber-700',
  },
  {
    labelKey: 'recentSessions',
    valueKey: 'recentSessions',
    color: 'bg-rose-50 text-rose-700',
  },
];

export default function AdminDashboardPage() {
  const adminDict = useAdminDict();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const data = await apiGet<AdminStats>('/api/admin/stats');
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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.dashboard}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.dashboardPage.subtitle}</p>

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
          {STAT_CARDS.map((card) => {
            const value = stats[card.valueKey];
            // usersByRole is a Record<string,number> — skip numeric display for it
            const numericValue = typeof value === 'number' ? value : null;
            return (
              <div
                key={card.labelKey}
                className={`rounded-xl border border-primary-100 p-6 ${card.color}`}
              >
                <p className="text-sm font-medium opacity-80">
                  {adminDict.dashboardPage.stats[card.labelKey]}
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {numericValue !== null ? numericValue.toLocaleString() : '—'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
