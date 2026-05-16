'use client';

import { useEffect, useRef, useState } from 'react';

import { useAdminDict } from '@/lib/admin-dictionary';
import { apiPatch } from '@/lib/api';

import type { AdminUserDTO, UserRole } from '@/lib/admin-types';

/**
 * R1 (C6) — Soft-paywall tier toggle button for the admin user-detail page.
 *
 * Visibility (R31 / R32) :
 *  - `viewerRole === 'super_admin'` → toggle button rendered, label flips
 *    between `toggleToPremium` and `toggleToFree` based on the current tier.
 *  - Anything else → read-only label (`currentFree` / `currentPremium`).
 *
 * Confirm flow (R33) :
 *  - Click → open a confirm modal (`confirmTitle` + `confirmBody` from dict).
 *  - Confirm → `apiPatch('/api/admin/users/<id>/tier', { tier: nextTier })`.
 *  - 2xx → `onUpdated(updatedUser)` callback fires + modal auto-closes.
 *  - 4xx/5xx → inline error from dict (`error` key), modal stays open so the
 *    operator can retry or cancel.
 *
 * No hard-coded UX strings — every visible literal flows through
 * `dict.admin.userDetailPage.tier.*` (R34 / N8 / AC18).
 */

interface AdminUserWithTier extends AdminUserDTO {
  tier: 'free' | 'premium';
}

interface TierToggleButtonProps {
  user: AdminUserDTO;
  viewerRole: UserRole;
  onUpdated?: (user: AdminUserDTO) => void;
}

export function TierToggleButton({ user, viewerRole, onUpdated }: TierToggleButtonProps) {
  const adminDict = useAdminDict();
  const tierDict = adminDict.userDetailPage.tier;
  const tierUser = user as AdminUserWithTier;
  const currentTier: 'free' | 'premium' = tierUser.tier;
  const nextTier: 'free' | 'premium' = currentTier === 'free' ? 'premium' : 'free';

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  const currentLabel = currentTier === 'free' ? tierDict.currentFree : tierDict.currentPremium;
  const toggleLabel = currentTier === 'free' ? tierDict.toggleToPremium : tierDict.toggleToFree;

  // R32 — viewer not super_admin → read-only label, no toggle.
  if (viewerRole !== 'super_admin') {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
        {currentLabel}
      </span>
    );
  }

  const handleConfirm = async (): Promise<void> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const updated = await apiPatch<{ user: AdminUserDTO }>(
        `/api/admin/users/${String(user.id)}/tier`,
        { tier: nextTier },
      );
      onUpdated?.(updated.user);
      setOpen(false);
    } catch {
      setErrorMessage(tierDict.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErrorMessage(null);
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
      >
        {toggleLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tier-modal-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="tier-modal-title" className="text-lg font-bold text-text-primary">
              {tierDict.confirmTitle}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{tierDict.confirmBody}</p>

            {errorMessage !== null && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setErrorMessage(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                {tierDict.cancel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleConfirm();
                }}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? '…' : tierDict.confirmCta}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
