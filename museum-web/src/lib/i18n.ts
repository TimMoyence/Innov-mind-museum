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
  download: {
    title: string;
    subtitle: string;
    appStore: string;
    googlePlay: string;
    appStorePrefix: string;
    googlePlayPrefix: string;
    appStoreHref: string;
    googlePlayComingSoon: string;
  };
  chatShowcase: {
    title: string;
    subtitle: string;
    bullets: string[];
    messages: { role: string; text: string }[];
  };
  mapsShowcase: {
    title: string;
    subtitle: string;
    bullets: string[];
  };
  faq: {
    title: string;
    items: { question: string; answer: string }[];
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
      sending: string;
      success: string;
      error: string;
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
      accessibility: string;
      security: string;
      b2b: string;
    };
  };
  resetPassword: {
    title: string;
    newPassword: string;
    confirmPassword: string;
    submit: string;
    success: string;
    successHint: string;
    backToLogin: string;
    passwordMismatch: string;
    passwordTooShort: string;
    invalidToken: string;
    error: string;
  };
  verifyEmail: {
    title: string;
    loading: string;
    success: string;
    successHint: string;
    invalidToken: string;
    invalidTokenHint: string;
    error: string;
    errorHint: string;
    backToHome: string;
    openApp: string;
  };
  confirmEmailChange: {
    title: string;
    loading: string;
    success: string;
    successHint: string;
    invalidToken: string;
    invalidTokenHint: string;
    error: string;
    errorHint: string;
    backToHome: string;
    openApp: string;
  };
  landing: {
    story: {
      title: string;
      subtitle: string;
      steps: { title: string; description: string }[];
    };
    b2b: {
      metadata: { title: string; description: string };
      hero: {
        title: string;
        subtitle: string;
        ctaPrimary: string;
        ctaSecondary: string;
      };
      problem: { title: string; body: string };
      solution: { title: string; body: string };
      differentiators: { title: string; description: string }[];
      pricing: { title: string; tease: string; contactCta: string };
      contact: {
        title: string;
        subtitle: string;
        fieldEmail: string;
        fieldName: string;
        fieldMuseum: string;
        fieldRole: string;
        roleOptions: { director: string; curator: string; digital: string; other: string };
        fieldMessage: string;
        fieldConsent: string;
        consentPrivacyLink: string;
        submit: string;
        sending: string;
        success: string;
        error: string;
        errorValidation: string;
      };
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
    reviewsAdmin: string;
    accessDenied: string;
    goToHomepage: string;
    login: {
      title: string;
      emailPlaceholder: string;
      passwordPlaceholder: string;
      submit: string;
      error: string;
      googleButton: string;
      divider: string;
      oauthError: string;
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
      active: string;
      inactive: string;
    };
    dashboardPage: {
      subtitle: string;
      stats: {
        totalUsers: string;
        totalSessions: string;
        totalMessages: string;
        recentSignups: string;
        recentSessions: string;
      };
    };
    auditLogsPage: {
      subtitle: string;
      filterPlaceholder: string;
      columnUser: string;
      columnAction: string;
      columnResource: string;
      columnDetails: string;
      emptyState: string;
    };
    usersPage: {
      subtitle: string;
      searchPlaceholder: string;
      allRoles: string;
      columnName: string;
      columnRole: string;
      columnStatus: string;
      columnLastLogin: string;
      emptyState: string;
      changeRole: string;
      view: string;
      viewAria: string;
    };
    userDetailPage: {
      subtitle: string;
      backToList: string;
      loading: string;
      errorNotFound: string;
      errorGeneric: string;
      errorLastAdmin: string;
      errorSelfAction: string;
      sectionIdentity: string;
      sectionStatus: string;
      sectionLifecycle: string;
      fieldId: string;
      fieldEmail: string;
      fieldName: string;
      fieldRole: string;
      fieldMuseum: string;
      fieldVerified: string;
      fieldSuspended: string;
      fieldDeletedAt: string;
      fieldCreated: string;
      fieldUpdated: string;
      badgeVerified: string;
      badgeUnverified: string;
      badgeSuspended: string;
      badgeActive: string;
      badgeDeleted: string;
      noValue: string;
      actionsTitle: string;
      actionChangeRole: string;
      actionSuspend: string;
      actionUnsuspend: string;
      actionDelete: string;
      confirmSuspendTitle: string;
      confirmSuspendBody: string;
      confirmSuspendButton: string;
      confirmUnsuspendTitle: string;
      confirmUnsuspendBody: string;
      confirmUnsuspendButton: string;
      confirmDeleteTitle: string;
      confirmDeleteBody: string;
      confirmDeleteTypeEmailLabel: string;
      confirmDeleteButton: string;
      successRoleChanged: string;
      successSuspended: string;
      successUnsuspended: string;
      successDeleted: string;
      newRoleLabel: string;
    };
    mfaPage: {
      successTitle: string;
      successBody: string;
      backToDashboard: string;
      setupTitle: string;
      setupIntro: string;
      generateButton: string;
      generating: string;
      qrAriaLabel: string;
      manualSecretIntro: string;
      recoveryTitle: string;
      recoveryWarning: string;
      copyAll: string;
      copyAllAria: string;
      codeLabel: string;
      codePlaceholder: string;
      verifyButton: string;
      verifying: string;
      errorPrefix: string;
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
    reviewsPage: {
      subtitle: string;
      filterStatus: string;
      rating: string;
      comment: string;
      author: string;
      approve: string;
      reject: string;
      confirmApprove: string;
      confirmReject: string;
      moderated: string;
      pending: string;
      approved: string;
      rejected: string;
      noReviews: string;
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
