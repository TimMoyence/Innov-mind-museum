import type { ReactNode } from 'react';
import { getDictionary, type Locale } from '@/lib/i18n';
import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams(): { locale: Locale }[] {
  return [{ locale: 'fr' }, { locale: 'en' }];
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <div lang={locale} className="flex min-h-screen flex-col">
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
