'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiGet, ApiError } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import { useAuth } from '@/lib/auth';
import { EmptyChartPlaceholder } from '@/components/admin/EmptyChartPlaceholder';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { MuseumDTO, NpsResponse, UserRole } from '@/lib/admin-types';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Roles allowed to pivot the NPS view across museums. `museum_manager` is
 * intentionally excluded (R25): the backend already forces a manager to its
 * own tenant (and 403s a NULL claim), but the UI must not even present a
 * cross-tenant selector. `super_admin` implicitly satisfies any admin check.
 */
const SELECTOR_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin',
  'moderator',
  'super_admin',
]);

interface NpsBucketPoint {
  /** Bucket label, sourced from the admin dictionary. */
  name: string;
  /** Response count for the bucket. */
  count: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NpsPage() {
  const adminDict = useAdminDict();
  const { user } = useAuth();
  const showSelector = user ? SELECTOR_ROLES.has(user.role) : false;

  // Data state — the endpoint payload is consumed verbatim (R27, no
  // client-side re-aggregation).
  const [nps, setNps] = useState<NpsResponse | null>(null);
  const [museums, setMuseums] = useState<MuseumDTO[]>([]);

  // Filter state. '' = global (all museums) — only reachable by SELECTOR_ROLES.
  const [museumId, setMuseumId] = useState<string>('');

  // UI state.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Append `?museumId=` only when a specific museum is selected; otherwise the
  // endpoint returns the global aggregate (R13). Managers never reach this
  // branch — the selector is hidden and `museumId` stays ''.
  function withMuseumScope(path: string): string {
    if (!museumId) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}museumId=${encodeURIComponent(museumId)}`;
  }

  // ── Fetch the NPS aggregate on mount + whenever the scope changes ─────────
  useEffect(() => {
    const tick = { cancelled: false };

    async function fetchNps() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<NpsResponse>(withMuseumScope('/api/admin/nps'));
        if (tick.cancelled) return;
        setNps(data);
      } catch (err) {
        if (tick.cancelled) return;
        // F6 — a museum_manager with a NULL museumId claim still sees this page
        // (the nav link is shown) but the backend 403s the read with
        // `forbidden('No museum assigned')` / `'Museum scope required'`. Surface
        // a clear, actionable message instead of the raw technical 403 text.
        if (err instanceof ApiError && err.status === 403) {
          setError(adminDict.npsPage.noMuseumAssigned);
        } else {
          setError(err instanceof Error ? err.message : adminDict.common.noData);
        }
      } finally {
        if (!tick.cancelled) setLoading(false);
      }
    }

    void fetchNps();
    return () => {
      tick.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + museumId-driven re-fetch; adminDict is stable per provider
  }, [museumId]);

  // ── Load the museum list once for the selector (non-managers only) ────────
  useEffect(() => {
    if (!showSelector) return;
    const tick = { cancelled: false };

    async function loadMuseums() {
      try {
        const data = await apiGet<{ museums?: MuseumDTO[]; data?: MuseumDTO[] }>('/api/museums');
        if (tick.cancelled) return;
        setMuseums(data.museums ?? data.data ?? []);
      } catch {
        // The selector still works with just the "all museums" option; if the
        // list endpoint is unreachable we degrade to the global view only.
      }
    }

    void loadMuseums();
    return () => {
      tick.cancelled = true;
    };
  }, [showSelector]);

  // ── Derived chart data (R27 — straight from the payload) ──────────────────
  const bucketData = useMemo<NpsBucketPoint[]>(() => {
    if (!nps) return [];
    return [
      { name: adminDict.npsPage.promoters, count: nps.promoters },
      { name: adminDict.npsPage.passives, count: nps.passives },
      { name: adminDict.npsPage.detractors, count: nps.detractors },
    ];
  }, [nps, adminDict.npsPage.promoters, adminDict.npsPage.passives, adminDict.npsPage.detractors]);

  const hasResponses = !!nps && nps.count > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{adminDict.nps}</h1>
          <p className="mt-1 text-text-secondary">{adminDict.npsPage.subtitle}</p>
        </div>

        {showSelector && (
          <div className="flex items-center gap-3">
            <select
              aria-label={adminDict.analyticsPage.museum}
              value={museumId}
              onChange={(e) => {
                setMuseumId(e.target.value);
              }}
              className="rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{adminDict.npsPage.allMuseums}</option>
              {museums.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <Spinner />
        </div>
      )}

      {/* Error */}
      {error && <AlertBanner variant="error" message={error} className="mt-4" />}

      {/* KPI cards + distribution — only once we have a payload */}
      {nps && (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-primary-100 bg-white p-6">
              <p className="text-sm font-medium text-text-secondary">{adminDict.npsPage.score}</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{nps.nps}</p>
            </div>

            <div className="rounded-xl border border-primary-100 bg-white p-6">
              <p className="text-sm font-medium text-text-secondary">
                {adminDict.npsPage.promoters}
              </p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{nps.promoters}</p>
            </div>

            <div className="rounded-xl border border-primary-100 bg-white p-6">
              <p className="text-sm font-medium text-text-secondary">
                {adminDict.npsPage.passives}
              </p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{nps.passives}</p>
            </div>

            <div className="rounded-xl border border-primary-100 bg-white p-6">
              <p className="text-sm font-medium text-text-secondary">
                {adminDict.npsPage.detractors}
              </p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{nps.detractors}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-primary-100 bg-white p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {adminDict.npsPage.distribution}
              </h2>
              <p className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{nps.count}</span>{' '}
                {adminDict.npsPage.responses}
              </p>
            </div>

            <div className="mt-6">
              {hasResponses ? (
                // recharts a11y (LESSONS F9): the SVG announces nothing on its
                // own, so the chart wrapper carries role="img" + a dictionary
                // aria-label. The bucket counts are already exposed verbatim by
                // the KPI cards above, so no duplicate tabular mirror is needed
                // (WCAG 1.1.1 / 1.3.1 satisfied by label + KPI text).
                <div role="img" aria-label={adminDict.npsPage.chartAriaLabel}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bucketData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="var(--sem-chart-primary)"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChartPlaceholder label={adminDict.common.noData} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
