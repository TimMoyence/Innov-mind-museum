'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { apiGet } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import type {
  UsageAnalytics,
  ContentAnalytics,
  EngagementAnalytics,
  AnalyticsGranularity,
} from '@/lib/admin-types';

// ── Helpers ──────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 14, 30, 90] as const;
const GRANULARITY_OPTIONS: AnalyticsGranularity[] = ['daily', 'weekly', 'monthly'];

interface UsageChartPoint {
  date: string;
  sessions: number;
  messages: number;
  activeUsers: number;
}

function mergeUsageTimeSeries(usage: UsageAnalytics): UsageChartPoint[] {
  const map = new Map<string, UsageChartPoint>();

  for (const pt of usage.sessionsCreated) {
    const existing = map.get(pt.date);
    if (existing) {
      existing.sessions = pt.count;
    } else {
      map.set(pt.date, { date: pt.date, sessions: pt.count, messages: 0, activeUsers: 0 });
    }
  }

  for (const pt of usage.messagesSent) {
    const existing = map.get(pt.date);
    if (existing) {
      existing.messages = pt.count;
    } else {
      map.set(pt.date, { date: pt.date, sessions: 0, messages: pt.count, activeUsers: 0 });
    }
  }

  for (const pt of usage.activeUsers) {
    const existing = map.get(pt.date);
    if (existing) {
      existing.activeUsers = pt.count;
    } else {
      map.set(pt.date, { date: pt.date, sessions: 0, messages: 0, activeUsers: pt.count });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Component ────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const adminDict = useAdminDict();
  const isFr = adminDict.dashboard === 'Tableau de bord';

  // Data state
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [content, setContent] = useState<ContentAnalytics | null>(null);
  const [engagement, setEngagement] = useState<EngagementAnalytics | null>(null);

  // Filter state
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch all three in parallel on mount ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [usageData, contentData, engagementData] = await Promise.all([
          apiGet<UsageAnalytics>(
            `/api/admin/analytics/usage?days=${days}&granularity=${granularity}`,
          ),
          apiGet<ContentAnalytics>('/api/admin/analytics/content?limit=10'),
          apiGet<EngagementAnalytics>('/api/admin/analytics/engagement'),
        ]);
        if (!cancelled) {
          setUsage(usageData);
          setContent(contentData);
          setEngagement(engagementData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-fetch only usage when filters change ──────────────────────────

  const fetchUsage = useCallback(async () => {
    try {
      const data = await apiGet<UsageAnalytics>(
        `/api/admin/analytics/usage?days=${days}&granularity=${granularity}`,
      );
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage analytics');
    }
  }, [days, granularity]);

  // Skip the initial render (handled by the mount useEffect above)
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    void fetchUsage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUsage]);

  // ── Derived data ──────────────────────────────────────────────────────

  const chartData = usage ? mergeUsageTimeSeries(usage) : [];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.analytics}</h1>
      <p className="mt-1 text-text-secondary">
        {isFr
          ? "Statistiques d'utilisation et d'engagement de la plateforme."
          : 'Platform usage and engagement statistics.'}
      </p>

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      {engagement && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <p className="text-sm font-medium text-text-secondary">
              {isFr ? 'Moy. messages/session' : 'Avg Messages/Session'}
            </p>
            <p className="mt-2 text-3xl font-bold text-text-primary">
              {engagement.avgMessagesPerSession.toFixed(1)}
            </p>
          </div>

          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <p className="text-sm font-medium text-text-secondary">
              {isFr ? 'Durée moy. (min)' : 'Avg Duration (min)'}
            </p>
            <p className="mt-2 text-3xl font-bold text-text-primary">
              {engagement.avgSessionDurationMinutes.toFixed(1)}
            </p>
          </div>

          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <p className="text-sm font-medium text-text-secondary">
              {isFr ? 'Taux de retour' : 'Return Rate'}
            </p>
            <p className="mt-2 text-3xl font-bold text-text-primary">
              {(engagement.returnUserRate * 100).toFixed(1)}%
            </p>
          </div>

          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <p className="text-sm font-medium text-text-secondary">
              {isFr ? 'Utilisateurs uniques' : 'Unique Users'}
            </p>
            <p className="mt-2 text-3xl font-bold text-text-primary">
              {engagement.totalUniqueUsers.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <p className="text-sm font-medium text-text-secondary">
              {isFr ? 'Utilisateurs récurrents' : 'Returning Users'}
            </p>
            <p className="mt-2 text-3xl font-bold text-text-primary">
              {engagement.returningUsers.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* ── Usage Charts ─────────────────────────────────────────────────── */}
      {usage && (
        <div className="mt-8 rounded-xl border border-primary-100 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              {isFr ? 'Utilisation' : 'Usage'}
            </h2>

            <div className="flex gap-3">
              <select
                value={granularity}
                onChange={(e) => { setGranularity(e.target.value as AnalyticsGranularity); }}
                className="rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {GRANULARITY_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g === 'daily'
                      ? isFr ? 'Quotidien' : 'Daily'
                      : g === 'weekly'
                        ? isFr ? 'Hebdomadaire' : 'Weekly'
                        : isFr ? 'Mensuel' : 'Monthly'}
                  </option>
                ))}
              </select>

              <select
                value={days}
                onChange={(e) => { setDays(Number(e.target.value)); }}
                className="rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                {DAYS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} {isFr ? 'jours' : 'days'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  name={isFr ? 'Sessions' : 'Sessions'}
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  name="Messages"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="activeUsers"
                  name={isFr ? 'Utilisateurs actifs' : 'Active Users'}
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Content Analytics ────────────────────────────────────────────── */}
      {content && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Top Artworks — Bar Chart */}
          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              {isFr ? 'Top oeuvres' : 'Top Artworks'}
            </h2>
            {content.topArtworks.length > 0 ? (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={content.topArtworks.map((a) => ({
                      name: a.title.length > 20 ? `${a.title.slice(0, 20)}...` : a.title,
                      count: a.count,
                    }))}
                    layout="vertical"
                    margin={{ left: 10, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-muted">
                {isFr ? 'Aucune donnee.' : 'No data available.'}
              </p>
            )}
          </div>

          {/* Top Museums — Table */}
          <div className="rounded-xl border border-primary-100 bg-white p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              {isFr ? 'Top musees' : 'Top Museums'}
            </h2>

            {content.topMuseums.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-primary-50">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-primary-100 bg-surface-elevated">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-text-secondary">
                        {isFr ? 'Musee' : 'Museum'}
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-text-secondary">
                        {isFr ? 'Conversations' : 'Conversations'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50">
                    {content.topMuseums.map((m) => (
                      <tr key={m.name} className="hover:bg-surface-muted/50">
                        <td className="px-4 py-2.5 text-text-primary">{m.name}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-text-primary">
                          {m.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-muted">
                {isFr ? 'Aucune donnee.' : 'No data available.'}
              </p>
            )}

            {/* Guardrail Block Rate */}
            <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                {isFr ? 'Taux de blocage guardrail' : 'Guardrail Block Rate'}
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {(content.guardrailBlockRate * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
