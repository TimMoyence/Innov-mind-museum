'use client';

import { useState } from 'react';

import { AlertBanner } from '@/components/ui/AlertBanner';
import { BaseModal } from '@/components/ui/BaseModal';
import { ModalActions } from '@/components/ui/ModalActions';
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

      <BaseModal
        open={open}
        onClose={() => {
          /* non-dismissable — Escape/backdrop never fires this */
        }}
        title={tierDict.confirmTitle}
        size="md"
        dismissable={false}
        footer={
          <ModalActions
            cancelLabel={tierDict.cancel}
            confirmLabel={tierDict.confirmCta}
            onCancel={() => {
              setOpen(false);
              setErrorMessage(null);
            }}
            onConfirm={() => {
              void handleConfirm();
            }}
            confirmBusy={busy}
          />
        }
      >
        <p className="mt-2 text-sm text-text-secondary">{tierDict.confirmBody}</p>

        {errorMessage !== null && (
          <AlertBanner variant="error" message={errorMessage} className="mt-3" />
        )}
      </BaseModal>
    </>
  );
}
