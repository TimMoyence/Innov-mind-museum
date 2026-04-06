import { locales, defaultLocale } from '@/lib/i18n';

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
