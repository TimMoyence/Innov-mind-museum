import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AdminDictProvider, useAdminDict } from './admin-dictionary';
import type { Dictionary } from '@/lib/i18n';
import type { ReactNode } from 'react';

const mockAdminDict: Dictionary['admin'] = {
  dashboard: 'Dashboard',
  users: 'Users',
  auditLogs: 'Audit Logs',
  reports: 'Reports',
  analytics: 'Analytics',
  tickets: 'Tickets',
  supportAdmin: 'Support',
  reviewsAdmin: 'Reviews',
  accessDenied: 'Access Denied',
  goToHomepage: 'Go to Homepage',
  login: { title: '', emailPlaceholder: '', passwordPlaceholder: '', submit: '', error: '' },
  common: {
    date: '',
    status: '',
    priority: '',
    actions: '',
    messages: '',
    user: '',
    userId: '',
    subject: '',
    confirm: '',
    cancel: '',
    previous: '',
    next: '',
    pageOf: '',
    allStatuses: '',
    allPriorities: '',
    noData: '',
    conversations: '',
    active: '',
    inactive: '',
  },
  dashboardPage: {
    subtitle: '',
    stats: {
      totalUsers: '',
      totalSessions: '',
      totalMessages: '',
      recentSignups: '',
      recentSessions: '',
    },
  },
  auditLogsPage: {
    subtitle: '',
    filterPlaceholder: '',
    columnUser: '',
    columnAction: '',
    columnResource: '',
    columnDetails: '',
    emptyState: '',
  },
  usersPage: {
    subtitle: '',
    searchPlaceholder: '',
    allRoles: '',
    columnName: '',
    columnRole: '',
    columnStatus: '',
    columnLastLogin: '',
    emptyState: '',
    changeRole: '',
  },
  reportsPage: {
    subtitle: '',
    reason: '',
    message: '',
    review: '',
    reviewReport: '',
    reportedMessage: '',
    reviewerNotes: '',
    reviewerNotesPlaceholder: '',
    noReports: '',
  },
  ticketsPage: { subtitle: '', update: '', view: '', updateTicket: '', noTickets: '' },
  reviewsPage: {
    subtitle: '',
    filterStatus: '',
    rating: '',
    comment: '',
    author: '',
    approve: '',
    reject: '',
    confirmApprove: '',
    confirmReject: '',
    moderated: '',
    pending: '',
    approved: '',
    rejected: '',
    noReviews: '',
  },
  supportPage: {
    subtitle: '',
    selectTicket: '',
    viewTickets: '',
    backToTickets: '',
    createdAt: '',
    description: '',
    noMessages: '',
    reply: '',
    replyPlaceholder: '',
    send: '',
    sending: '',
  },
  analyticsPage: {
    subtitle: '',
    avgMessages: '',
    avgDuration: '',
    returnRate: '',
    uniqueUsers: '',
    returningUsers: '',
    usage: '',
    daily: '',
    weekly: '',
    monthly: '',
    days: '',
    sessions: '',
    messagesSent: '',
    activeUsers: '',
    topArtworks: '',
    topMuseums: '',
    museum: '',
    guardrailBlockRate: '',
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      {children}
    </AdminDictProvider>
  );
}

describe('AdminDictProvider / useAdminDict', () => {
  it('provides the admin dictionary through context', () => {
    const { result } = renderHook(() => useAdminDict(), { wrapper });
    expect(result.current.dashboard).toBe('Dashboard');
    expect(result.current.users).toBe('Users');
  });

  it('throws when used outside provider', () => {
    // renderHook will catch the error for us
    expect(() => {
      renderHook(() => useAdminDict());
    }).toThrow('useAdminDict must be used within an AdminDictProvider');
  });
});
