'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TierToggleButton } from '@/components/admin/TierToggleButton';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useAdminDict } from '@/lib/admin-dictionary';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, useDateLocale } from '@/lib/i18n-format';

import type { AdminUserDTO, UserRole } from '@/lib/admin-types';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-700',
  museum_manager: 'bg-purple-100 text-purple-700',
  moderator: 'bg-blue-100 text-blue-700',
  visitor: 'bg-gray-100 text-gray-700',
};

// Roles assignable from the admin panel. `super_admin` is platform-owner,
// granted out-of-band; never grantable from the UI (mirrors `users/page.tsx`).
const ASSIGNABLE_ROLES: Exclude<UserRole, 'super_admin'>[] = [
  'visitor',
  'moderator',
  'museum_manager',
  'admin',
];

type ModalKind = null | 'role' | 'suspend' | 'unsuspend' | 'delete';

interface SimpleConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function SimpleConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  destructive,
  onCancel,
  onConfirm,
}: SimpleConfirmModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click + Escape handled
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current && !busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="confirm-modal-title" className="text-lg font-bold text-text-primary">
          {title}
        </h2>
        {body !== '' && <p className="mt-2 text-sm text-text-secondary">{body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserDetailPage({ params }: PageProps) {
  const { locale, id } = use(params);
  const adminDict = useAdminDict();
  const dict = adminDict.userDetailPage;
  const dateLocale = useDateLocale();
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const userId = Number.parseInt(id, 10);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [user, setUser] = useState<AdminUserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Modal + form state
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('visitor');
  const [deleteEmailTyped, setDeleteEmailTyped] = useState('');

  const fetchUser = useCallback(async () => {
    if (Number.isNaN(userId)) {
      setError(dict.errorNotFound);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ user: AdminUserDTO }>(`/api/admin/users/${String(userId)}`);
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(dict.errorNotFound);
      } else {
        setError(err instanceof Error ? err.message : dict.errorGeneric);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, dict.errorNotFound, dict.errorGeneric]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const closeModal = useCallback(() => {
    if (busy) return;
    setModal(null);
    setDeleteEmailTyped('');
  }, [busy]);

  const runMutation = useCallback(
    async (
      action: () => Promise<{ user: AdminUserDTO } | undefined>,
      successMsg: string,
      onSuccess?: (next: AdminUserDTO | undefined) => void,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        if (result?.user) {
          setUser(result.user);
        }
        setFlash(successMsg);
        setModal(null);
        setDeleteEmailTyped('');
        onSuccess?.(result?.user);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409 && err.message.includes('LAST_ADMIN')) {
            setError(dict.errorLastAdmin);
          } else if (err.status === 409 && err.message.includes('SELF')) {
            setError(dict.errorSelfAction);
          } else {
            setError(err.message);
          }
        } else {
          setError(err instanceof Error ? err.message : dict.errorGeneric);
        }
      } finally {
        setBusy(false);
      }
    },
    [dict.errorLastAdmin, dict.errorSelfAction, dict.errorGeneric],
  );

  const onConfirmRole = useCallback(() => {
    if (!user) return;
    void runMutation(
      () =>
        apiPatch<{ user: AdminUserDTO }>(`/api/admin/users/${String(userId)}/role`, {
          role: newRole,
        }),
      dict.successRoleChanged,
    );
  }, [user, userId, newRole, runMutation, dict.successRoleChanged]);

  const onConfirmSuspend = useCallback(() => {
    void runMutation(
      () =>
        apiPost<{ user: AdminUserDTO }>(`/api/admin/users/${String(userId)}/suspend`, undefined),
      dict.successSuspended,
    );
  }, [userId, runMutation, dict.successSuspended]);

  const onConfirmUnsuspend = useCallback(() => {
    void runMutation(
      () =>
        apiPost<{ user: AdminUserDTO }>(`/api/admin/users/${String(userId)}/unsuspend`, undefined),
      dict.successUnsuspended,
    );
  }, [userId, runMutation, dict.successUnsuspended]);

  const onConfirmDelete = useCallback(() => {
    void runMutation(
      () => apiDelete<{ user: AdminUserDTO }>(`/api/admin/users/${String(userId)}`),
      dict.successDeleted,
      () => {
        router.push(`/${locale}/admin/users`);
      },
    );
  }, [userId, runMutation, dict.successDeleted, router, locale]);

  const displayName = useMemo(() => {
    if (!user) return '';
    const parts = [user.firstname, user.lastname].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : user.email;
  }, [user]);

  // ── Render branches ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <Spinner label={dict.loading} />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="max-w-xl">
        <Link href={`/${locale}/admin/users`} className="text-sm text-primary-600 hover:underline">
          ← {dict.backToList}
        </Link>
        <div className="mt-6 rounded-xl bg-red-50 p-6 text-red-700">{error}</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isSoftDeleted = user.deletedAt !== null;
  const isSelf = currentUser?.id === user.id;
  const roleUnchanged = newRole === (user.role as UserRole);
  const deleteEmailMatches = deleteEmailTyped === user.email;

  return (
    <div>
      <Link href={`/${locale}/admin/users`} className="text-sm text-primary-600 hover:underline">
        ← {dict.backToList}
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-text-primary">{displayName}</h1>
      <p className="mt-1 text-text-secondary">{dict.subtitle}</p>

      {flash && <AlertBanner variant="success" message={flash} className="mt-4" />}
      {error && <AlertBanner variant="error" message={error} className="mt-4" />}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* Identity */}
        <section
          aria-labelledby="section-identity"
          className="rounded-xl border border-primary-100 bg-white p-6"
        >
          <h2
            id="section-identity"
            className="text-sm font-semibold uppercase tracking-wide text-text-secondary"
          >
            {dict.sectionIdentity}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <DescRow label={dict.fieldId} value={String(user.id)} />
            <DescRow label={dict.fieldEmail} value={user.email} />
            <DescRow label={dict.fieldName} value={displayName} />
            <DescRow
              label={dict.fieldRole}
              valueNode={
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ROLE_BADGE_CLASSES[user.role as UserRole]
                  }`}
                >
                  {user.role}
                </span>
              }
            />
            <DescRow
              label={dict.fieldMuseum}
              value={user.museumId !== null ? `#${String(user.museumId)}` : dict.noValue}
            />
            {/* R1 (C6) — soft-paywall tier toggle. Read-only label for non
                super_admin viewers ; the component handles its own visibility. */}
            <DescRow
              label={dict.tier.label}
              valueNode={
                <TierToggleButton
                  user={user}
                  viewerRole={currentUser?.role ?? 'visitor'}
                  onUpdated={(next) => {
                    setUser(next);
                  }}
                />
              }
            />
          </dl>
        </section>

        {/* Status */}
        <section
          aria-labelledby="section-status"
          className="rounded-xl border border-primary-100 bg-white p-6"
        >
          <h2
            id="section-status"
            className="text-sm font-semibold uppercase tracking-wide text-text-secondary"
          >
            {dict.sectionStatus}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <DescRow
              label={dict.fieldVerified}
              valueNode={
                <StatusBadge
                  active={user.emailVerified}
                  labelOn={dict.badgeVerified}
                  labelOff={dict.badgeUnverified}
                />
              }
            />
            <DescRow
              label={dict.fieldSuspended}
              valueNode={
                <StatusBadge
                  active={user.suspended}
                  labelOn={dict.badgeSuspended}
                  labelOff={dict.badgeActive}
                  warningOn
                />
              }
            />
            {isSoftDeleted && (
              <DescRow
                label={dict.fieldDeletedAt}
                valueNode={
                  <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {dict.badgeDeleted} · {formatDateTime(user.deletedAt as string, dateLocale)}
                  </span>
                }
              />
            )}
          </dl>
        </section>

        {/* Lifecycle */}
        <section
          aria-labelledby="section-lifecycle"
          className="rounded-xl border border-primary-100 bg-white p-6 md:col-span-2"
        >
          <h2
            id="section-lifecycle"
            className="text-sm font-semibold uppercase tracking-wide text-text-secondary"
          >
            {dict.sectionLifecycle}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <DescRow label={dict.fieldCreated} value={formatDateTime(user.createdAt, dateLocale)} />
            <DescRow label={dict.fieldUpdated} value={formatDateTime(user.updatedAt, dateLocale)} />
          </dl>
        </section>
      </div>

      {/* Actions */}
      {(isAdmin || isSuperAdmin) && !isSoftDeleted && (
        <section
          aria-labelledby="section-actions"
          className="mt-8 rounded-xl border border-primary-100 bg-white p-6"
        >
          <h2
            id="section-actions"
            className="text-sm font-semibold uppercase tracking-wide text-text-secondary"
          >
            {dict.actionsTitle}
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setNewRole(user.role as UserRole);
                  setModal('role');
                }}
                className="rounded-lg bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
              >
                {dict.actionChangeRole}
              </button>
            )}
            {isSuperAdmin && !user.suspended && (
              <button
                type="button"
                disabled={isSelf}
                onClick={() => {
                  setModal('suspend');
                }}
                className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={isSelf ? dict.errorSelfAction : undefined}
              >
                {dict.actionSuspend}
              </button>
            )}
            {isSuperAdmin && user.suspended && (
              <button
                type="button"
                onClick={() => {
                  setModal('unsuspend');
                }}
                className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                {dict.actionUnsuspend}
              </button>
            )}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setModal('delete');
                }}
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                {dict.actionDelete}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Modals */}
      {modal === 'role' && (
        <RoleChangeModal
          adminDict={adminDict}
          dict={dict}
          targetEmail={user.email}
          currentRole={user.role as UserRole}
          newRole={newRole}
          onNewRoleChange={setNewRole}
          unchanged={roleUnchanged}
          busy={busy}
          onCancel={closeModal}
          onConfirm={onConfirmRole}
        />
      )}
      {modal === 'suspend' && (
        <SimpleConfirmModal
          title={dict.confirmSuspendTitle}
          body={dict.confirmSuspendBody}
          confirmLabel={dict.confirmSuspendButton}
          cancelLabel={adminDict.common.cancel}
          busy={busy}
          destructive
          onCancel={closeModal}
          onConfirm={onConfirmSuspend}
        />
      )}
      {modal === 'unsuspend' && (
        <SimpleConfirmModal
          title={dict.confirmUnsuspendTitle}
          body={dict.confirmUnsuspendBody}
          confirmLabel={dict.confirmUnsuspendButton}
          cancelLabel={adminDict.common.cancel}
          busy={busy}
          onCancel={closeModal}
          onConfirm={onConfirmUnsuspend}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirmModal
          dict={dict}
          cancelLabel={adminDict.common.cancel}
          targetEmail={user.email}
          typed={deleteEmailTyped}
          onTypedChange={setDeleteEmailTyped}
          canConfirm={deleteEmailMatches}
          busy={busy}
          onCancel={closeModal}
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────

function DescRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 shrink-0 font-medium text-text-secondary">{label}</dt>
      <dd className="text-text-primary">{valueNode ?? value}</dd>
    </div>
  );
}

function StatusBadge({
  active,
  labelOn,
  labelOff,
  warningOn,
}: {
  active: boolean;
  labelOn: string;
  labelOff: string;
  warningOn?: boolean;
}) {
  if (active) {
    return (
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
          warningOn ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'
        }`}
      >
        {labelOn}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      {labelOff}
    </span>
  );
}

function RoleChangeModal({
  adminDict,
  dict,
  targetEmail,
  currentRole,
  newRole,
  onNewRoleChange,
  unchanged,
  busy,
  onCancel,
  onConfirm,
}: {
  adminDict: ReturnType<typeof useAdminDict>;
  dict: ReturnType<typeof useAdminDict>['userDetailPage'];
  targetEmail: string;
  currentRole: UserRole;
  newRole: UserRole;
  onNewRoleChange: (r: UserRole) => void;
  unchanged: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  // Window-level Escape: the dialog div is not focusable, so a div-scoped
  // onKeyDown never fires when focus stays on the action button that opened
  // the modal. Window listener catches Escape regardless of focus location.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [busy, onCancel]);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- Backdrop is a non-interactive dialog wrapper. Escape is handled via a window-level keydown listener (see useEffect above), so the keyboard contract is satisfied without focus inside this div.
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="role-modal-title" className="text-lg font-bold text-text-primary">
          {adminDict.usersPage.changeRole}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{targetEmail}</p>
        <label htmlFor="new-role-select" className="mt-4 block text-sm text-text-secondary">
          {dict.newRoleLabel}
        </label>
        <select
          id="new-role-select"
          value={newRole}
          onChange={(e) => {
            onNewRoleChange(e.target.value as UserRole);
          }}
          className="mt-1 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          {currentRole === 'super_admin' && <option value="super_admin">super_admin</option>}
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            {adminDict.common.cancel}
          </button>
          <button
            type="button"
            disabled={busy || unchanged}
            onClick={onConfirm}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '…' : adminDict.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  dict,
  cancelLabel,
  targetEmail,
  typed,
  onTypedChange,
  canConfirm,
  busy,
  onCancel,
  onConfirm,
}: {
  dict: ReturnType<typeof useAdminDict>['userDetailPage'];
  cancelLabel: string;
  targetEmail: string;
  typed: string;
  onTypedChange: (v: string) => void;
  canConfirm: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  // Window-level Escape: the dialog div is not focusable, so a div-scoped
  // onKeyDown never fires when focus stays on the action button that opened
  // the modal. Window listener catches Escape regardless of focus location.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [busy, onCancel]);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- Backdrop is a non-interactive dialog wrapper. Escape is handled via a window-level keydown listener (see useEffect above), so the keyboard contract is satisfied without focus inside this div.
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-modal-title" className="text-lg font-bold text-red-700">
          {dict.confirmDeleteTitle}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{dict.confirmDeleteBody}</p>
        <p className="mt-3 text-sm">
          <span className="text-text-secondary">{dict.fieldEmail}: </span>
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-text-primary">
            {targetEmail}
          </code>
        </p>
        <label htmlFor="confirm-delete-email" className="mt-4 block text-sm text-text-secondary">
          {dict.confirmDeleteTypeEmailLabel}
        </label>
        <input
          id="confirm-delete-email"
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => {
            onTypedChange(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '…' : dict.confirmDeleteButton}
          </button>
        </div>
      </div>
    </div>
  );
}
