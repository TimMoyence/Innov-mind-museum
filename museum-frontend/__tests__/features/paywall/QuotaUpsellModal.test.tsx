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
import { TextInput } from 'react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

// C1 hexagonal (2026-05-23) — modal now POSTs via
// `leadsApi.submitPaywallInterest(payload)`. Mock the service ; `mockPost`
// is invoked with the payload object as its sole argument (no URL/header args).
const mockPost = jest.fn();
jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: {
    submitPaywallInterest: (payload: unknown) =>
      mockPost('/api/leads/paywall-interest', payload) as Promise<unknown>,
  },
}));

// R1 corrective (2026-05-15) — Sentry mock comes from the global test-utils.tsx
// (which exports addBreadcrumb: jest.fn() since the same R1 corrective loop).
// Per-file re-mock removed because jest hoisting causes the global mock —
// imported via line 24 — to override the per-file one and break assertions.
// We retrieve the spy via `jest.requireMock` so `expect` assertions still work.
const mockAddBreadcrumb = jest.requireMock<{ addBreadcrumb: jest.Mock }>(
  '@sentry/react-native',
).addBreadcrumb;

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
    const en = (
      require('@/shared/locales/en/translation.json') as { paywall: Record<string, string> }
    ).paywall;
    const fr = (
      require('@/shared/locales/fr/translation.json') as { paywall: Record<string, string> }
    ).paywall;
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

/**
 * F2 RED — QuotaUpsellModal state reset on visible transition (bug_005).
 *
 * Pins F2.R1 / R6 / R7 / R12 + AC1/AC2/AC3/AC5 down BEFORE implementation.
 * Baseline `26a30424` keeps the 4 useState slots across open/close cycles
 * (RN <Modal visible={false}> hides chrome but does not unmount children).
 * The five sequence assertions below MUST FAIL at HEAD — green-code-agent
 * lands the `useEffect(reset, [visible])` fix per D1=(a).
 */
describe('QuotaUpsellModal F2 — state reset on visible transition (bug_005)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  // ── Test A — Email reset on reopen (F2.R7 / F2.AC1) ─────────────────

  it('F2.A: email field is empty on reopen after typing + close', () => {
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    expect(screen.getByLabelText('paywall.fieldEmail').props.value).toBe('user1@example.com');

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    // F2.R7 — email must reset to '' on every false→true transition.
    expect(screen.getByLabelText('paywall.fieldEmail').props.value).toBe('');
  });

  // ── Test B — Consent reset on reopen (F2.R6 / F2.AC2) ───────────────

  it('F2.B: consent checkbox is unchecked on reopen after ticking + close', () => {
    // F2.AC2 GDPR Art. 7 enforcement — consent inheritance forbidden between opens
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    expect(screen.getByLabelText('paywall.consent').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    // F2.R6 — consent must reset to false on every open ; GDPR Art. 7 per-act.
    expect(screen.getByLabelText('paywall.consent').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  // ── Test C — Success banner not inherited on reopen (F2.R4 / F2.AC1) ─

  it('F2.C: success banner not visible on reopen after a prior successful submit', async () => {
    mockPost.mockResolvedValueOnce({ data: { accepted: true } });
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.success')).toBeTruthy();
    });

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    // F2.R4 — success banner is per-open, must not bleed across visible transitions.
    expect(screen.queryByText('paywall.success')).toBeNull();
  });

  // ── Test D — Error banner not inherited on reopen (F2.R5 / F2.AC3) ──

  it('F2.D: error banner not visible on reopen after a prior failed submit', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.error')).toBeTruthy();
    });

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    // F2.R5 — error banner is per-open, must not bleed across visible transitions.
    expect(screen.queryByText('paywall.error')).toBeNull();
  });

  // ── Test E — Honeypot reset on reopen (F2.R1 / F2.AC5 / Risk5) ──────

  it('F2.E: honeypot field is empty on reopen after a bot-fill simulation', () => {
    // Per Risk5 — honeypot is style.display='none', not reachable via accessible
    // queries. We target via UNSAFE_getAllByType(TextInput) + style filter on
    // `display: 'none'` to pick the hidden trap.
    const findHoneypot = (): ReturnType<typeof screen.UNSAFE_getAllByType>[number] => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const honeypot = inputs.find((input) => {
        const style = input.props.style as { display?: string } | undefined;
        return style?.display === 'none';
      });
      if (!honeypot) {
        throw new Error('honeypot TextInput not found via UNSAFE_getAllByType + style filter');
      }
      return honeypot;
    };

    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    // Simulate bot-fill — fireEvent.changeText triggers setWebsite + re-render.
    fireEvent.changeText(findHoneypot(), 'bot-tripped-this');
    expect(findHoneypot().props.value).toBe('bot-tripped-this');

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    // F2.R1 — `website` slot must reset to '' on every false→true transition.
    expect(findHoneypot().props.value).toBe('');
  });
});

// ── F3 §1 R3..R8 — resetAt locale-aware formatting ──
//
// Pins F3.R1..R8 + AC1/AC2/AC3/AC5/AC7 down BEFORE implementation. Baseline
// `b6e4dd46` renders the raw ISO `reason.resetAt` verbatim — the four happy
// path + locale-switch assertions below FAIL. The defensive-fallback case
// (F3.C) accidentally passes pre-fix because the raw ISO is rendered as-is ;
// we keep the "no Invalid Date string" guard so the assertion still pins
// behaviour post-fix without losing meaning. RED-ness of the file comes from
// F3.A / F3.B / F3.D / F3.E.
describe('QuotaUpsellModal resetAt formatting (F3 §1 R3..R8)', () => {
  // The test-utils i18n mock exports `useTranslation` as a function returning
  // a hardcoded `{ language: 'en' }`. To swap locale per-test we mutate the
  // mock module's `useTranslation` property — Jest property assignment is
  // honored by the component's import binding at call time.
  interface I18nMock {
    useTranslation: (...args: unknown[]) => {
      t: (key: string) => string;
      i18n: { language: string };
    };
  }
  const i18nMock = jest.requireMock<I18nMock>('react-i18next');
  const originalUseTranslation = i18nMock.useTranslation;
  const setLanguage = (lang: string): void => {
    i18nMock.useTranslation = () => ({ t: (key: string) => key, i18n: { language: lang } });
  };

  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });
  afterEach(() => {
    i18nMock.useTranslation = originalUseTranslation;
  });

  // ── F3.A — Raw ISO MUST NOT be visible (F3.R1 / AC1) ──────────────
  it('F3.A: raw ISO 2026-06-01T00:00:00.000Z is NOT rendered anywhere', () => {
    setLanguage('en');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    // RNTL `queryAllByText` only accepts string | RegExp — regex with the ISO
    // literal scans every rendered Text node ; any hit is a render violation.
    // Use length-based assertion (not toEqual([])) — RNTL elements contain
    // circular host refs and Jest's diff serializer blows the stack on them.
    expect(screen.queryAllByText(/2026-06-01T00:00:00\.000Z/).length).toBe(0);
  });

  // ── F3.B — EN locale renders human date (F3.R1 / AC1) ─────────────
  it('F3.B: EN locale renders human-readable "June" + "2026"', () => {
    setLanguage('en');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    // Permissive regex — accepts "June 1, 2026" (en-US) OR "1 June 2026" (en-GB)
    // OR any future ICU revision that still includes the month + year tokens.
    expect(screen.queryAllByText(/June.*2026|2026.*June/).length).toBeGreaterThan(0);
  });

  // ── F3.C — FR locale renders human date (F3.R1 / AC2) ─────────────
  it('F3.C: FR locale renders human-readable "juin" + "2026"', () => {
    setLanguage('fr');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryAllByText(/juin.*2026|2026.*juin/).length).toBeGreaterThan(0);
  });

  // ── F3.D — Defensive fallback on invalid ISO (F3.R3 / AC3) ────────
  it('F3.D: invalid ISO falls back to raw string, no crash, no "Invalid Date"', () => {
    setLanguage('en');
    expect(() =>
      render(
        <QuotaUpsellModal
          visible
          reason={fixtureReason({ resetAt: 'NOT-A-VALID-DATE' })}
          onClose={jest.fn()}
        />,
      ),
    ).not.toThrow();

    // Raw fallback IS rendered (ugly-but-safe per F3.R3 — surfaces BE bug to QA).
    expect(screen.queryAllByText(/NOT-A-VALID-DATE/).length).toBeGreaterThan(0);

    // "Invalid Date" (the toString() of NaN-Date) MUST NOT leak through.
    expect(screen.queryAllByText(/Invalid Date/).length).toBe(0);
  });

  // ── F3.E — Memoization sentinel : stable across re-renders (F3.R6) ─
  it('F3.E: re-render with identical resetAt yields identical formatted output', () => {
    setLanguage('en');
    const { rerender } = render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    const firstHit = screen.queryAllByText(/June.*2026|2026.*June/);
    expect(firstHit.length).toBeGreaterThan(0);
    const firstNode = firstHit[0];
    if (!firstNode) throw new Error('F3.E: expected at least one June 2026 hit on first render');
    const firstText = JSON.stringify(firstNode.props.children);

    // Re-render with the SAME resetAt — output must be byte-identical (no flicker,
    // no formatter thrash). This is a smoke test, not a strict perf assertion.
    rerender(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    const secondHit = screen.queryAllByText(/June.*2026|2026.*June/);
    expect(secondHit.length).toBeGreaterThan(0);
    const secondNode = secondHit[0];
    if (!secondNode) throw new Error('F3.E: expected at least one June 2026 hit on second render');
    expect(JSON.stringify(secondNode.props.children)).toEqual(firstText);
  });
});
