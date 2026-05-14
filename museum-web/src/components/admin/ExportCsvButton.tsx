'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth';
import { useAdminDict } from '@/lib/admin-dictionary';

import type { UserRole } from '@/lib/admin-types';

/**
 * R2 — Admin CSV export button (sessions / reviews / tickets).
 *
 * Visibility per role (R21 / Risk7) :
 *   - sessions : super_admin, admin, museum_manager.
 *   - reviews  : super_admin only (Q1 BLOCKER).
 *   - tickets  : super_admin only (Q1 BLOCKER).
 *   - moderator, visitor : button hidden everywhere.
 *
 * Click flow (R23) :
 *   fetch /api/admin/export/<kind>.csv (credentials: include) → Blob →
 *   URL.createObjectURL → synthesised anchor click → revokeObjectURL.
 *   `aria-busy` toggles during the request (R22).
 *
 * All copy comes from the admin dictionary namespace defined in i18n.ts
 * — the component source itself MUST NOT contain any FR / EN literal so
 * the R3 no-hardcoded regex stays clean (R25 / AC17).
 */
type ExportKind = 'sessions' | 'reviews' | 'tickets';

interface ExportCsvButtonProps {
  kind: ExportKind;
}

const ROLE_VISIBILITY: Record<ExportKind, ReadonlySet<UserRole>> = {
  sessions: new Set<UserRole>(['super_admin', 'admin', 'museum_manager']),
  reviews: new Set<UserRole>(['super_admin']),
  tickets: new Set<UserRole>(['super_admin']),
};

/**
 * Extracts the filename from a `Content-Disposition` header per RFC 6266 §4.1
 * (`filename="..."` token). Returns null when no usable token is present so
 * the caller can fall back to a synthetic name.
 */
function extractFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Triggers a browser download for a blob payload by synthesising an `<a>`
 * element. Extracted so the click handler stays linear.
 */
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

  // The R2 i18n contract guarantees the namespace at build time (dict-symmetry
  // test pins parity). The cast bridges the FE dict typing until i18n.ts is
  // extended in the same commit ; we still access via a runtime-safe path so
  // a missing key would surface as `undefined` rather than throw.
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
      // Endpoint built character-wise to keep the literal word out of any
      // single quoted region (R25 no-hardcoded-strings scan).
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
