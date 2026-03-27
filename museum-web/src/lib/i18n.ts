export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

// Dictionaries are loaded on the server only — never shipped to the client bundle.
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  fr: () => import('@/dictionaries/fr.json').then((m) => m.default),
  en: () => import('@/dictionaries/en.json').then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
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
    ctaSecondary: string;
  };
  features: {
    title: string;
    items: { title: string; description: string }[];
    gridTitle: string;
    gridSubtitle: string;
    grid: { title: string; description: string }[];
  };
  showcase: {
    title: string;
    description: string;
    caption: string;
    sectionTitle: string;
    sectionSubtitle: string;
  };
  reviews: {
    title: string;
    subtitle: string;
    cta: string;
    ctaSubtitle: string;
    leaveReview: string;
    stars: string;
  };
  download: {
    title: string;
    subtitle: string;
    appStore: string;
    googlePlay: string;
    appStorePrefix: string;
    googlePlayPrefix: string;
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
      success: string;
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
    accessDenied: string;
    goToHomepage: string;
    login: {
      title: string;
      emailPlaceholder: string;
      passwordPlaceholder: string;
      submit: string;
      error: string;
    };
    common: {
      date: string;
      status: string;
      priority: string;
      actions: string;
      messages: string;
      user: string;
      userId: string;
      subject: string;
      confirm: string;
      cancel: string;
      previous: string;
      next: string;
      pageOf: string;
      allStatuses: string;
      allPriorities: string;
      noData: string;
      conversations: string;
    };
    reportsPage: {
      subtitle: string;
      reason: string;
      message: string;
      review: string;
      reviewReport: string;
      reportedMessage: string;
      reviewerNotes: string;
      reviewerNotesPlaceholder: string;
      noReports: string;
    };
    ticketsPage: {
      subtitle: string;
      update: string;
      view: string;
      updateTicket: string;
      noTickets: string;
    };
    supportPage: {
      subtitle: string;
      selectTicket: string;
      viewTickets: string;
      backToTickets: string;
      createdAt: string;
      description: string;
      noMessages: string;
      reply: string;
      replyPlaceholder: string;
      send: string;
      sending: string;
    };
    analyticsPage: {
      subtitle: string;
      avgMessages: string;
      avgDuration: string;
      returnRate: string;
      uniqueUsers: string;
      returningUsers: string;
      usage: string;
      daily: string;
      weekly: string;
      monthly: string;
      days: string;
      sessions: string;
      messagesSent: string;
      activeUsers: string;
      topArtworks: string;
      topMuseums: string;
      museum: string;
      guardrailBlockRate: string;
    };
  };
}
