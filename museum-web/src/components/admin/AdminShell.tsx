'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, RoleGuard, useAuth } from '@/lib/auth';
import { AdminDictProvider, useAdminDict } from '@/lib/admin-dictionary';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n';

// ── Nav item keys that map to Dictionary['admin'] fields ───────────────

const NAV_KEYS = [
  'dashboard',
  'users',
  'auditLogs',
  'reports',
  'analytics',
  'tickets',
  'supportAdmin',
  'reviewsAdmin',
  'nps',
] as const;

type NavKey = (typeof NAV_KEYS)[number];

// C1B / R8 — nav keys a `museum_manager` can actually use, tenant-scoped to
// their own museum. Mirrors the backend `requireRole` allow-list that admits
// museum_manager (stats→dashboard, nps, reviews, tickets). Every other role
// sees the full NAV_KEYS set. The 5 hidden keys (users, auditLogs, reports,
// analytics, supportAdmin) stay admin/moderator-only — leaving them visible
// gave the manager dead 403 links.
const MUSEUM_MANAGER_NAV_KEYS: readonly NavKey[] = ['dashboard', 'reviewsAdmin', 'tickets', 'nps'];

/** Map each nav key to its URL suffix. */
const NAV_PATHS: Record<NavKey, string> = {
  dashboard: '',
  users: '/users',
  auditLogs: '/audit-logs',
  reports: '/reports',
  analytics: '/analytics',
  tickets: '/tickets',
  supportAdmin: '/support',
  reviewsAdmin: '/reviews',
  nps: '/nps',
};

// ── Authenticated admin layout with sidebar ────────────────────────────

function AuthenticatedLayout({ children, locale }: { children: ReactNode; locale: string }) {
  const adminDict = useAdminDict();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  // C1B / R8 — a museum_manager only sees the links it can use (tenant-scoped);
  // every other allow-listed role sees the full nav set.
  const visibleNavKeys: readonly NavKey[] =
    user?.role === 'museum_manager' ? MUSEUM_MANAGER_NAV_KEYS : NAV_KEYS;

  const basePath = `/${locale}/admin`;

  function isActive(href: string): boolean {
    if (href === basePath) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => {
            setSidebarOpen(false);
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-primary-100 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-primary-100 px-6">
          <Link href={basePath} className="text-lg font-bold tracking-tight text-primary-700">
            Musaium Admin
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
          <ul className="space-y-1">
            {visibleNavKeys.map((key) => {
              const href = `${basePath}${NAV_PATHS[key]}`;
              const active = isActive(href);
              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={() => {
                      setSidebarOpen(false);
                    }}
                    className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`}
                  >
                    {adminDict[key]}
                  </Link>
                </li>
              );
            })}
            {isSuperAdmin && (
              // Super-admin-only ops surface (Grafana iframe). Hidden for
              // every other role — including `admin` (B2B operator) — so
              // cross-tenant ops data never appears in a museum operator's
              // navigation. Server-side defense at nginx auth_request +
              // RoleGuard at the page layout.
              <li key="ops-grafana">
                <Link
                  href={`${basePath}/ops/grafana`}
                  onClick={() => {
                    setSidebarOpen(false);
                  }}
                  className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(`${basePath}/ops/grafana`)
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                  }`}
                >
                  Ops · Grafana
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with hamburger (mobile) */}
        <header className="flex h-16 items-center border-b border-primary-100 bg-white px-4 md:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-text-secondary hover:bg-surface-muted"
            aria-label="Open sidebar"
            onClick={() => {
              setSidebarOpen(true);
            }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            </svg>
          </button>
          <span className="ml-3 text-lg font-bold text-primary-700">Musaium Admin</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// ── Main exported shell ────────────────────────────────────────────────

interface AdminShellProps {
  children: ReactNode;
  locale: string;
  adminDict: Dictionary['admin'];
}

export default function AdminShell({ children, locale, adminDict }: AdminShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname.endsWith('/admin/login');

  if (isLoginPage) {
    return (
      <AdminDictProvider dict={adminDict} locale={locale as 'fr' | 'en'}>
        <AuthProvider>{children}</AuthProvider>
      </AdminDictProvider>
    );
  }

  return (
    <AdminDictProvider dict={adminDict} locale={locale as 'fr' | 'en'}>
      <AuthProvider>
        {/* Wave B C9 / R-C9 — `museum_manager` added to admin allow-list.
            The role was previously blocked at the entry by RoleGuard despite being
            valid everywhere else (ExportCsvButton, support/page, OpenAPI). FE
            sub-pages still rely on per-page scoping to confine the operator to
            their own tenant; the BE enforces the actual tenant scope (Wave B C8
            admin route RBAC scope museumId forcing). */}
        <RoleGuard allowedRoles={['admin', 'moderator', 'super_admin', 'museum_manager']}>
          <AuthenticatedLayout locale={locale}>{children}</AuthenticatedLayout>
        </RoleGuard>
      </AuthProvider>
    </AdminDictProvider>
  );
}
