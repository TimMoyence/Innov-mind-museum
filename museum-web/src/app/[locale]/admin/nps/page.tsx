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

const SELECTOR_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin',
  'moderator',
  'super_admin',
]);

interface NpsBucketPoint {
  name: string;
  count: number;
}

function withMuseumScope(path: string, museumId: string): string {
  if (!museumId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}museumId=${encodeURIComponent(museumId)}`;
}

export default function NpsPage() {
  const adminDict = useAdminDict();
  const { user } = useAuth();
  const showSelector = user ? SELECTOR_ROLES.has(user.role) : false;

  const [nps, setNps] = useState<NpsResponse | null>(null);
  const [museums, setMuseums] = useState<MuseumDTO[]>([]);

  const [museumId, setMuseumId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = { cancelled: false };

    async function fetchNps() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<NpsResponse>(withMuseumScope('/api/admin/nps', museumId));
        if (tick.cancelled) return;
        setNps(data);
      } catch (err) {
        if (tick.cancelled) return;
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
  }, [museumId, adminDict.common.noData, adminDict.npsPage.noMuseumAssigned]);

  useEffect(() => {
    if (!showSelector) return;
    const tick = { cancelled: false };

    async function loadMuseums() {
      try {
        const data = await apiGet<{ museums?: MuseumDTO[]; data?: MuseumDTO[] }>('/api/museums');
        if (tick.cancelled) return;
        setMuseums(data.museums ?? data.data ?? []);
      } catch {}
    }

    void loadMuseums();
    return () => {
      tick.cancelled = true;
    };
  }, [showSelector]);

  const bucketData = useMemo<NpsBucketPoint[]>(() => {
    if (!nps) return [];
    return [
      { name: adminDict.npsPage.promoters, count: nps.promoters },
      { name: adminDict.npsPage.passives, count: nps.passives },
      { name: adminDict.npsPage.detractors, count: nps.detractors },
    ];
  }, [nps, adminDict.npsPage.promoters, adminDict.npsPage.passives, adminDict.npsPage.detractors]);

  const hasResponses = !!nps && nps.count > 0;

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

      {loading && (
        <div className="mt-12 flex justify-center">
          <Spinner />
        </div>
      )}

      {error && <AlertBanner variant="error" message={error} className="mt-4" />}

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
