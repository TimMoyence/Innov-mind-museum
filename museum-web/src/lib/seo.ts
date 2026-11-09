import { locales, defaultLocale, getDictionary, type Dictionary, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://musaium.com';

export function getAlternates(locale: string, path = '') {
  return {
    canonical: `${BASE_URL}/${locale}${path}`,
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
      'x-default': `${BASE_URL}/${defaultLocale}${path}`,
    },
  };
}

export function getOpenGraph(locale: string) {
  return {
    locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    alternateLocale: locale === 'fr' ? ['en_US'] : ['fr_FR'],
    siteName: 'Musaium',
    type: 'website' as const,
    images: [{ url: '/images/logo.png', width: 1024, height: 1024, alt: 'Musaium' }],
  };
}

export const footerPageMetadata =
  (link: keyof Dictionary['footer']['links'], path: string) =>
  async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    const dict = await getDictionary(locale as Locale);
    return {
      title: dict.footer.links[link],
      alternates: getAlternates(locale, path),
      openGraph: getOpenGraph(locale),
    };
  };
