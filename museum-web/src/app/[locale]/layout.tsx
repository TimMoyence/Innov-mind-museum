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
      {/*
        I-CMP5(a) / R9 (WCAG 2.4.1 "Bypass Blocks") — keyboard-reachable
        skip-link as the FIRST focusable element. It must live here (not in
        <Header>, which is a client component returning null on /admin/* routes
        — design §D3) so it precedes the header logo in the tab order. Copy from
        the i18n dict (per-component string-guard: no hardcoded UX phrase).
        `sr-only focus:not-sr-only` keeps it visually hidden until focused.
      */}
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]"
      >
        {dict.a11y.skipToContent}
      </a>
      <Header dict={dict} locale={locale as Locale} />
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Footer dict={dict} locale={locale as Locale} />
    </div>
  );
}
