'use client';

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isFr: boolean;
}

export function AdminPagination({ page, totalPages, total, onPageChange, isFr }: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-primary-100 px-6 py-3">
      <p className="text-sm text-text-secondary">
        {isFr
          ? `Page ${String(page)} sur ${String(totalPages)} (${String(total)} résultats)`
          : `Page ${String(page)} of ${String(totalPages)} (${String(total)} results)`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => { onPageChange(page - 1); }}
          className="rounded-md border border-primary-200 px-3 py-1 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFr ? 'Précédent' : 'Previous'}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => { onPageChange(page + 1); }}
          className="rounded-md border border-primary-200 px-3 py-1 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFr ? 'Suivant' : 'Next'}
        </button>
      </div>
    </div>
  );
}
