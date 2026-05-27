/**
 * C1B (RED — UFR-022 fresh-context red phase 2026-05-26).
 *
 * Analytics `?museumId` desync removal (spec-c1b.md AC-8 / R9, design-c1b.md
 * §2 web / D6, tasks-c1b.md T-R5). The analytics page wires a per-museum
 * `<select aria-label="Museum">` (`analytics/page.tsx:214-230`) whose
 * `withMuseumScope` (`:108-112`) appends `?museumId=<id>` to the three
 * analytics calls — but the BE schemas are `z.strictObject` with NO
 * `museumId` key (`admin.schemas.ts:63-79`), so picking a museum 400s every
 * call. The route handlers never even read `museumId`, and analytics is
 * `requireRole('admin')`-only (hidden from the manager by R8). The fix
 * (Q1 decision (a)) is to REMOVE the dead FE plumbing — no BE per-museum
 * analytics feature is built.
 *
 * This test pins BOTH halves of the removal:
 *   1. the museum `<select aria-label="Museum">` is gone, and
 *   2. none of the three analytics request URLs carry a `museumId` key.
 *
 * Pattern source : `src/__tests__/admin/admin-analytics.test.tsx` — recharts
 * mocked to plain divs; `apiGet` mocked; `AdminDictProvider` + `AuthProvider`
 * wrap. Here `apiGet` is a URL-router (not ordered `mockResolvedValueOnce`)
 * because `loadMuseums` (`/api/museums`) and the three analytics fetches fire
 * from independent effects with non-deterministic ordering — and `/api/museums`
 * MUST resolve to ≥1 museum so that, on baseline, the `<select>` renders
 * (`museums.length > 0` gate, `analytics/page.tsx:214`).
 *
 * Baseline failure : with museums loaded, baseline renders the museum
 * `<select aria-label="Museum">` → `queryByLabelText('Museum')` is non-null →
 * the `toBeNull()` assertion FAILS.
 *
 * Frozen-test invariant (UFR-022 phase red) : immutable byte-for-byte once
 * committed. Suspect a test is wrong → `BLOCK-TEST-WRONG <path>:<line>
 * <reason>`, never edit.
 *
 * Lib-docs consulted : `lib-docs/react/PATTERNS.md` (§8 testing patterns —
 * observable DOM + captured-call assertions; recharts/next mocking mirrors
 * admin-analytics.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import AnalyticsPage from '@/app/[locale]/admin/analytics/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { UsageAnalytics, ContentAnalytics, EngagementAnalytics } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/analytics',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── Recharts mock (jsdom has no layout for ResponsiveContainer) ──────────────

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ── API mock — URL router (records every called URL) ─────────────────────────

const calledUrls: string[] = [];
const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

// ── Test data ───────────────────────────────────────────────────────────────

const mockUsage: UsageAnalytics = {
  period: { from: '2025-05-01', to: '2025-05-30' },
  granularity: 'daily',
  sessionsCreated: [{ date: '2025-05-01', count: 10 }],
  messagesSent: [{ date: '2025-05-01', count: 50 }],
  activeUsers: [{ date: '2025-05-01', count: 8 }],
};

const mockContent: ContentAnalytics = {
  topArtworks: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', count: 320 }],
  topMuseums: [{ name: 'Louvre', count: 1500 }],
  guardrailBlockRate: 0.032,
};

const mockEngagement: EngagementAnalytics = {
  avgMessagesPerSession: 6.3,
  avgSessionDurationMinutes: 4.8,
  returnUserRate: 0.42,
  totalUniqueUsers: 1250,
  returningUsers: 525,
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

describe('AnalyticsPage — no museumId plumbing (C1B / R9 / AC-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calledUrls.length = 0;
    // Route by the requested path. `/api/museums` returns ≥1 museum so the
    // baseline renders the (to-be-removed) `<select aria-label="Museum">`.
    mockApiGet.mockImplementation((url: string) => {
      calledUrls.push(url);
      if (url.startsWith('/api/museums')) {
        return Promise.resolve({ museums: [{ id: 42, name: 'Test Museum' }] });
      }
      if (url.startsWith('/api/admin/analytics/usage')) return Promise.resolve(mockUsage);
      if (url.startsWith('/api/admin/analytics/content')) return Promise.resolve(mockContent);
      if (url.startsWith('/api/admin/analytics/engagement')) {
        return Promise.resolve(mockEngagement);
      }
      return Promise.resolve({});
    });
  });

  it('does NOT render the per-museum filter select', async () => {
    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    // Wait until the data has loaded (KPI card visible) so any museum-driven
    // `<select>` would have had every chance to mount.
    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    // Baseline renders <select aria-label="Museum"> once museums load → this
    // FAILS until the plumbing is removed.
    expect(screen.queryByLabelText('Museum')).toBeNull();
  });

  it('issues NO analytics request carrying a museumId query key', async () => {
    render(
      <Providers>
        <AnalyticsPage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Avg Messages')).toBeInTheDocument();
    });

    const analyticsUrls = calledUrls.filter((u) => u.startsWith('/api/admin/analytics/'));
    expect(analyticsUrls.length).toBeGreaterThanOrEqual(3);
    for (const url of analyticsUrls) {
      expect(url).not.toContain('museumId');
    }
  });
});
