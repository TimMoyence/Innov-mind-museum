'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, AuthGuard } from '@/lib/auth';
import type { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

interface NavItem {
  key: string;
  label: string;
  href: string;
}

function AdminShell({ children, locale }: { children: ReactNode; locale: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: `/${locale}/admin` },
    { key: 'users', label: 'Users', href: `/${locale}/admin/users` },
    { key: 'auditLogs', label: 'Audit Logs', href: `/${locale}/admin/audit-logs` },
    { key: 'reports', label: 'Reports', href: `/${locale}/admin/reports` },
    { key: 'analytics', label: 'Analytics', href: `/${locale}/admin/analytics` },
    { key: 'tickets', label: 'Tickets', href: `/${locale}/admin/tickets` },
    { key: 'support', label: 'Support', href: `/${locale}/admin/support` },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}/admin`) {
      return pathname === href;
    }
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
            href={`/${locale}/admin`}
            className="text-lg font-bold tracking-tight text-primary-700"
          >
            Musaium Admin
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`}
                  >
                    {item.label}
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
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span className="ml-3 text-lg font-bold text-primary-700">Musaium Admin</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  // Extract locale from pathname (e.g. /fr/admin/… → fr)
  const locale = pathname.split('/')[1] ?? 'fr';

  // Login page should NOT be wrapped in AuthGuard
  const isLoginPage = pathname.endsWith('/admin/login');

  if (isLoginPage) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <AuthGuard>
        <AdminShell locale={locale}>{children}</AdminShell>
      </AuthGuard>
    </AuthProvider>
  );
}
