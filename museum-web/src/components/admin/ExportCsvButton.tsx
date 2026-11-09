'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { useAdminDict } from '@/lib/admin-dictionary';

import type { UserRole } from '@/lib/admin-types';

type ExportKind = 'sessions' | 'reviews' | 'tickets';

interface ExportCsvButtonProps {
  kind: ExportKind;
}

const ROLE_VISIBILITY: Record<ExportKind, ReadonlySet<UserRole>> = {
  sessions: new Set<UserRole>(['super_admin', 'admin', 'museum_manager']),
  reviews: new Set<UserRole>(['super_admin']),
  tickets: new Set<UserRole>(['super_admin']),
};

function extractFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ExportCsvButton({ kind }: ExportCsvButtonProps) {
  const dict = useAdminDict();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!user) return null;
  if (!ROLE_VISIBILITY[kind].has(user.role)) return null;

  const exportDict = (
    dict as unknown as {
      export?: Record<ExportKind, { label: string; downloading: string; error: string }>;
    }
  ).export;
  const copy = exportDict?.[kind];
  const label = copy?.label ?? kind;
  const downloadingCopy = copy?.downloading ?? label;
  const errorCopy = copy?.error ?? label;

  async function handleClick() {
    setErrored(false);
    setLoading(true);
    try {
      const endpoint = `/api/admin/export/${kind}.csv`;
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) {
        setErrored(true);
        return;
      }
      const blob = await res.blob();
      const filename = extractFilename(res.headers.get('Content-Disposition')) ?? `${kind}.csv`;
      triggerDownload(blob, filename);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? downloadingCopy : label}
      </button>
      {errored ? (
        <span role="alert" aria-live="polite" className="text-xs text-red-600">
          {errorCopy}
        </span>
      ) : null}
    </div>
  );
}
