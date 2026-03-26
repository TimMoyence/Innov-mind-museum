'use client';

import { useAdminDict } from '@/lib/admin-dictionary';

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ page, totalPages, total, onPageChange }: AdminPaginationProps) {
  const adminDict = useAdminDict();

  if (totalPages <= 1) return null;

  const pageOf = adminDict.common.pageOf
    .replace('{page}', String(page))
    .replace('{totalPages}', String(totalPages))
    .replace('{total}', String(total));

  return (
    <div className="flex items-center justify-between border-t border-primary-100 px-6 py-3">
      <p className="text-sm text-text-secondary">{pageOf}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => { onPageChange(page - 1); }}
          className="rounded-md border border-primary-200 px-3 py-1 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adminDict.common.previous}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => { onPageChange(page + 1); }}
          className="rounded-md border border-primary-200 px-3 py-1 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adminDict.common.next}
        </button>
      </div>
    </div>
  );
}
