'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import { useAuth } from '@/lib/auth';
import { AdminPagination } from '@/components/admin/AdminPagination';
import type { PaginatedResponse, User, UserRole } from '@/lib/admin-types';

// ── Role badge colors ──────────────────────────────────────────────────

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  museum_manager: 'bg-purple-100 text-purple-700',
  moderator: 'bg-blue-100 text-blue-700',
  visitor: 'bg-gray-100 text-gray-700',
};

const ALL_ROLES: UserRole[] = ['visitor', 'moderator', 'museum_manager', 'admin'];

// ── Debounce hook ──────────────────────────────────────────────────────

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(value); }, delay);
    return () => { clearTimeout(id); };
  }, [value, delay]);
  return debounced;
}

// ── Page component ─────────────────────────────────────────────────────

export default function UsersPage() {
  const adminDict = useAdminDict();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Change role modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('visitor');
  const [changingRole, setChangingRole] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const isFr = adminDict.dashboard === 'Tableau de bord';

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '10');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (roleFilter) params.set('role', roleFilter);

      const data = await apiGet<PaginatedResponse<User>>(
        `/api/admin/users?${params.toString()}`,
      );
      setUsers(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // ── Change role handler ──────────────────────────────────────────────

  async function handleChangeRole() {
    if (!editingUser) return;
    setChangingRole(true);
    try {
      await apiPatch<User>(`/api/admin/users/${editingUser.id}/role`, {
        role: newRole,
      });
      setEditingUser(null);
      void fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setChangingRole(false);
    }
  }

  // ── Ref for modal backdrop ───────────────────────────────────────────
  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.users}</h1>
      <p className="mt-1 text-text-secondary">
        {isFr ? 'Gérez les utilisateurs de la plateforme.' : 'Manage platform users.'}
      </p>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder={isFr ? 'Rechercher...' : 'Search...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:max-w-xs"
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value as UserRole | ''); }}
          className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="">{isFr ? 'Tous les rôles' : 'All roles'}</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="mt-6 overflow-hidden rounded-xl border border-primary-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-primary-100 bg-surface-elevated">
                <tr>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {isFr ? 'Nom' : 'Name'}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">Email</th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {isFr ? 'Rôle' : 'Role'}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {isFr ? 'Statut' : 'Status'}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {isFr ? 'Dernière connexion' : 'Last Login'}
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 font-medium text-text-secondary">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="px-6 py-12 text-center text-text-muted"
                    >
                      {isFr ? 'Aucun utilisateur trouvé.' : 'No users found.'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-muted/50">
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {u.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {u.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {u.isActive
                            ? isFr ? 'Actif' : 'Active'
                            : isFr ? 'Inactif' : 'Inactive'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-6 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setNewRole(u.role);
                            }}
                            className="rounded-md px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                          >
                            {isFr ? 'Changer le rôle' : 'Change Role'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Change Role Modal */}
      {editingUser && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === modalRef.current) setEditingUser(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingUser(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-text-primary">
              {isFr ? 'Changer le rôle' : 'Change Role'}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {editingUser.name} ({editingUser.email})
            </p>

            <select
              value={newRole}
              onChange={(e) => { setNewRole(e.target.value as UserRole); }}
              className="mt-4 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setEditingUser(null); }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={changingRole || newRole === editingUser.role}
                onClick={() => void handleChangeRole()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {changingRole
                  ? '...'
                  : isFr ? 'Confirmer' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
