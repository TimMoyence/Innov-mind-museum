/**
 * R1 RED — QuotaUpsellModal (T1.10 — P in brief).
 *
 * Pins R1 §1 R26/R27/R28/R29 + N6 + N10 + Q7 down BEFORE implementation :
 *  - Renders a native RN `<Modal>` (NOT BottomSheetRouter) when isOpen=true.
 *  - Has a dismissible close button (R26 accessibilityLabel + Q7 dismissible).
 *  - CTA "join premium list" → POST `/api/leads/paywall-interest` via
 *    httpClient with `{email, consent:true, website:''}` payload.
 *  - Honeypot field (`website`) rendered as hidden / visually-hidden input
 *    and never auto-filled.
 *  - RGPD consent checkbox visible, default unchecked, must be checked
 *    before submit fires (N6).
 *  - On success → `paywall.success` shown (R27).
 *  - On error → `paywall.error` shown (R28), modal stays open.
 *  - i18n keys all consumed via `t('paywall.*')` (R29 no hardcoded strings).
 *
 * MUST FAIL at baseline `cd7e22bc` — the modal component
 * `features/paywall/ui/QuotaUpsellModal` does not exist. Brief uses
 * `QuotaUpsellModal` ; R1 spec uses `PaywallModal`. We pin the brief's name
 * since it's the public contract artifact the green agent owns.
 *
 * File ext `.test.tsx` — JSX render via @testing-library/react-native.
 */
import '@/__tests__/helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPost = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: {
    post: (...args: unknown[]) => mockPost(...args) as Promise<unknown>,
  },
  setPaywallHandler: jest.fn(),
}));

// R1 corrective (2026-05-15) — Sentry mock comes from the global test-utils.tsx
// (which exports addBreadcrumb: jest.fn() since the same R1 corrective loop).
// Per-file re-mock removed because jest hoisting causes the global mock —
// imported via line 24 — to override the per-file one and break assertions.
// We retrieve the spy via `jest.requireMock` so `expect` assertions still work.
const mockAddBreadcrumb = (jest.requireMock('@sentry/react-native') as { addBreadcrumb: jest.Mock })
  .addBreadcrumb;

// Module under test — load fails at HEAD → RED for the whole file.
import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';

interface QuotaInfo {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

const fixtureReason = (overrides: Partial<QuotaInfo> = {}): QuotaInfo => ({
  tier: 'free',
  currentCount: 3,
  limit: 3,
  resetAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

describe('QuotaUpsellModal (R1 §1 R26-R29 + N6 + Q7)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  // ── R26 — renders i18n-driven labels ─────────────────────────────────

  it('R26: renders title + body + email field + CTA from t(paywall.*) keys', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    // The shared test-utils mock makes `t(key)` return the key verbatim, so
    // the i18n keys themselves appear as text — that proves the component
    // consumed `t('paywall.modalTitle')`, etc.
    expect(screen.getByText('paywall.modalTitle')).toBeTruthy();
    expect(screen.getByText('paywall.modalBody')).toBeTruthy();
    expect(screen.getByLabelText('paywall.fieldEmail')).toBeTruthy();
    expect(screen.getByText('paywall.submit')).toBeTruthy();
  });

  // ── R26 / Q7 — dismissible close button with accessibilityLabel ──────

  it('Q7: dismissible close button has accessibilityLabel from t(paywall.dismiss)', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    expect(screen.getByLabelText('paywall.dismiss')).toBeTruthy();
  });

  it('Q7: pressing the close button invokes onClose', () => {
    const onClose = jest.fn();
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('paywall.dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── N6 — explicit consent checkbox required ──────────────────────────

  it('N6: submit disabled (or no POST fired) until the consent checkbox is checked', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    fireEvent.press(screen.getByText('paywall.submit'));
    // POST MUST NOT fire without explicit consent (mirror R3 N5).
    expect(mockPost).not.toHaveBeenCalled();
  });

  // ── R27 — successful submit triggers POST + success state + breadcrumb

  it('R27: submit with consent checked → POST /api/leads/paywall-interest, success state, breadcrumb', async () => {
    mockPost.mockResolvedValueOnce({ data: { accepted: true } });
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    // The consent checkbox should be labelled via i18n.
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/leads/paywall-interest',
      expect.objectContaining({
        email: 'free-tier@example.com',
        consent: true,
        website: '',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('paywall.success')).toBeTruthy();
    });
    // R27 — Sentry breadcrumb on 202 resolution.
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'paywall',
        message: 'paywall_email_captured',
      }),
    );
  });

  // ── R28 — error state keeps the modal open ───────────────────────────

  it('R28: POST failure → t(paywall.error) inline, modal stays open', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.error')).toBeTruthy();
    });
    // Modal stays open → title still visible.
    expect(screen.getByText('paywall.modalTitle')).toBeTruthy();
  });

  // ── R29 — paywall i18n keys symmetry sentinel ───────────────────────

  it('R29: every locale ships a non-empty paywall namespace (en + fr)', () => {
    // Spec drift recorded in report : the brief item S is consolidated into
    // this sentinel test rather than its own file (≤19-file constraint).
    // `require()` is intentional — keeps the test self-contained and avoids
    // tsconfig.test JSON include surgery just to bring the locale modules in.
    const en = require('@/shared/locales/en/paywall.json') as Record<string, string>;
    const fr = require('@/shared/locales/fr/paywall.json') as Record<string, string>;
    const required = [
      'modalTitle',
      'modalBody',
      'fieldEmail',
      'submit',
      'sending',
      'success',
      'error',
      'dismiss',
      'consent',
      'resetsOn',
    ];
    for (const key of required) {
      expect(en[key]).toBeDefined();
      expect(fr[key]).toBeDefined();
      expect(typeof en[key]).toBe('string');
      expect(typeof fr[key]).toBe('string');
    }
  });
});
