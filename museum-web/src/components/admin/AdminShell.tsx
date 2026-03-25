'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, AuthGuard } from '@/lib/auth';
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
] as const;

type NavKey = (typeof NAV_KEYS)[number];

/** Map each nav key to its URL suffix. */
const NAV_PATHS: Record<NavKey, string> = {
  dashboard: '',
  users: '/users',
  auditLogs: '/audit-logs',
  reports: '/reports',
  analytics: '/analytics',
  tickets: '/tickets',
  supportAdmin: '/support',
};

// ── Authenticated admin layout with sidebar ────────────────────────────

function AuthenticatedLayout({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const adminDict = useAdminDict();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          onClick={() => setSidebarOpen(false)}
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
          <Link
            href={basePath}
            className="text-lg font-bold tracking-tight text-primary-700"
          >
            Musaium Admin
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
          <ul className="space-y-1">
            {NAV_KEYS.map((key) => {
              const href = `${basePath}${NAV_PATHS[key]}`;
              const active = isActive(href);
              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={() => setSidebarOpen(false)}
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
            onClick={() => setSidebarOpen(true)}
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
          <span className="ml-3 text-lg font-bold text-primary-700">
            Musaium Admin
          </span>
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

export default function AdminShell({
  children,
  locale,
  adminDict,
}: AdminShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname.endsWith('/admin/login');

  if (isLoginPage) {
    return (
      <AdminDictProvider dict={adminDict}>
        <AuthProvider>{children}</AuthProvider>
      </AdminDictProvider>
    );
  }

  return (
    <AdminDictProvider dict={adminDict}>
      <AuthProvider>
        <AuthGuard>
          <AuthenticatedLayout locale={locale}>
            {children}
          </AuthenticatedLayout>
        </AuthGuard>
      </AuthProvider>
    </AdminDictProvider>
  );
}
