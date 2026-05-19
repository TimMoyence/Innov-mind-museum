import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// TD-NEXT-02 — pre-render FR + EN at build so the [locale] cold path serves
// from static cache instead of running RSC + dictionary load per request
// (lib-docs/next/PATTERNS.md §3).
export function generateStaticParams(): { locale: Locale }[] {
  return [{ locale: 'fr' }, { locale: 'en' }];
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <div lang={locale} className="flex min-h-screen flex-col">
      <Header dict={dict} locale={locale as Locale} />
      <main className="flex-1">{children}</main>
      <Footer dict={dict} locale={locale as Locale} />
    </div>
  );
}
