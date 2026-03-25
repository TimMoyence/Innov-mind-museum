export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

// Dictionaries are loaded on the server only — never shipped to the client bundle.
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  fr: () => import('@/dictionaries/fr.json').then((m) => m.default),
  en: () => import('@/dictionaries/en.json').then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loader = dictionaries[locale];
  if (!loader) return dictionaries[defaultLocale]();
  return loader();
}

/** Shape of a dictionary file — extend as pages are built out. */
export interface Dictionary {
  metadata: {
    title: string;
    description: string;
  };
  nav: {
    home: string;
    support: string;
    privacy: string;
    admin: string;
    login: string;
    download: string;
    language: string;
  };
  hero: {
    title: string;
    subtitle: string;
    cta: string;
  };
  features: {
    title: string;
    items: { title: string; description: string }[];
  };
  support: {
    title: string;
    subtitle: string;
    faq: { question: string; answer: string }[];
    contact: {
      title: string;
      namePlaceholder: string;
      emailPlaceholder: string;
      messagePlaceholder: string;
      submit: string;
    };
  };
  privacy: {
    title: string;
  };
  footer: {
    copyright: string;
    madeBy: string;
    links: {
      privacy: string;
      support: string;
    };
  };
  admin: {
    dashboard: string;
    users: string;
    auditLogs: string;
    reports: string;
    analytics: string;
    tickets: string;
    supportAdmin: string;
    login: {
      title: string;
      emailPlaceholder: string;
      passwordPlaceholder: string;
      submit: string;
      error: string;
    };
  };
}
