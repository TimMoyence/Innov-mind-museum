'use client';

import { useAdminDict } from '@/lib/admin-dictionary';
import Link from 'next/link';
import { useFetchData } from '@/lib/hooks/useFetchData';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { MuseumDTO } from '@/lib/admin-types';

interface ListResponse {
  museums?: MuseumDTO[];
  data?: MuseumDTO[];
}

export default function MuseumsListPage() {
  const adminDict = useAdminDict();
  const copy = adminDict.museumsPage;
  const {
    data: museumsPayload,
    loading,
    error,
  } = useFetchData<MuseumDTO[]>('/api/museums', {
    parseData: (raw) => {
      const r = raw as ListResponse;
      return r.museums ?? r.data ?? [];
    },
    errorFallback: copy.errorLoad,
  });
  const museums = museumsPayload ?? [];

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{copy.subtitle}</p>
        </div>
        <Link
          href="museums/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {copy.newCta}
        </Link>
      </header>

      {error && <AlertBanner variant="error" message={error} />}

      {loading && <p className="text-sm text-gray-600">{copy.loading}</p>}

      {!loading && !error && museums.length === 0 && (
        <p className="text-sm text-gray-600">{copy.empty}</p>
      )}

      {!loading && museums.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {copy.cols.name}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {copy.cols.slug}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {copy.cols.type}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {copy.cols.active}
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {copy.cols.actions}
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
                      {m.isActive ? adminDict.common.active : adminDict.common.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <Link
                      href={`museums/${m.id}/branding`}
                      className="text-blue-600 hover:underline"
                    >
                      {copy.branding}
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
