import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import AdminShell from '@/components/admin/AdminShell';

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <AdminShell locale={locale} adminDict={dict.admin}>
      {children}
    </AdminShell>
  );
}
