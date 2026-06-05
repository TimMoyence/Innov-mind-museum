'use client';

import Link from 'next/link';
import { useFetchData } from '@/lib/hooks/useFetchData';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { MuseumDTO } from '@/lib/admin-types';

// W4 W2.1/2.2 — Admin museum list. Parent route for /admin/museums/new
// and /admin/museums/[id]/branding. English-only strings inline (admin is
// internal + operator is bilingual; full i18n parity tracked as TD-27).

const STRINGS = {
  title: 'Museums',
  subtitle: 'Manage B2B-pilot museum tenants. Onboard new museums and configure branding.',
  newCta: '+ Onboard new museum',
  loading: 'Loading museums…',
  empty: 'No museums yet. Click "Onboard new museum" to add the first one.',
  error: 'Could not load museums.',
  cols: {
    name: 'Name',
    slug: 'Slug',
    type: 'Type',
    active: 'Active',
    actions: 'Actions',
  },
  actions: {
    branding: 'Branding',
  },
} as const;

interface ListResponse {
  museums?: MuseumDTO[];
  data?: MuseumDTO[];
}

export default function MuseumsListPage() {
  // The BE returns { museums: [...] } for /directory and may return either
  // shape for the admin list. parseData tolerates both and yields MuseumDTO[].
  const {
    data: museumsPayload,
    loading,
    error,
  } = useFetchData<MuseumDTO[]>('/api/museums', {
    parseData: (raw) => {
      const r = raw as ListResponse;
      return r.museums ?? r.data ?? [];
    },
    errorFallback: STRINGS.error,
  });
  const museums = museumsPayload ?? [];

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{STRINGS.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{STRINGS.subtitle}</p>
        </div>
        <Link
          href="museums/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {STRINGS.newCta}
        </Link>
      </header>

      {error && <AlertBanner variant="error" message={error} />}

      {loading && <p className="text-sm text-gray-600">{STRINGS.loading}</p>}

      {!loading && !error && museums.length === 0 && (
        <p className="text-sm text-gray-600">{STRINGS.empty}</p>
      )}

      {!loading && museums.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {STRINGS.cols.name}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {STRINGS.cols.slug}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {STRINGS.cols.type}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {STRINGS.cols.active}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {STRINGS.cols.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {museums.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">{m.name}</td>
                  <td className="px-4 py-2 font-mono text-sm text-gray-600">{m.slug}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{m.museumType}</td>
                  <td className="px-4 py-2 text-sm">
                    <span
                      className={
                        m.isActive
                          ? 'inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                          : 'inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                      }
                    >
                      {m.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <Link
                      href={`museums/${m.id}/branding`}
                      className="text-blue-600 hover:underline"
                    >
                      {STRINGS.actions.branding}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
