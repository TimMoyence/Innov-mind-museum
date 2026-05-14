/**
 * R3 RED tests — BetaSignupSection (client component on the landing).
 *
 * Pins R3 §1 R2-R11 + R17 (a11y for live region) + AC3(a-i) down BEFORE
 * implementation.
 *
 * - 1 email input + 1 consent checkbox + 1 hidden honeypot `website`
 * - empty submit → consent + email errors visible (form not POSTed)
 * - happy path : POST `/api/leads/beta` JSON `{ email, consent: true, website }`
 *   → 202 → success message visible (in role="status" aria-live="polite")
 * - 5xx response : error message displayed, form values preserved
 * - honeypot filled → success-UX (silent), body still POSTed with the honeypot
 * - sending label visible while pending
 * - aria-live="polite" region exposed
 * - idempotent path : duplicate signups → same 202 success UX (no leak)
 *
 * MUST FAIL at baseline `d5919dd3` — `BetaSignupSection.tsx` does not exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import BetaSignupSection from '../BetaSignupSection';

// ── i18n fixtures (mirror R3.md §3.5) ────────────────────────────────────────

const dictEN = {
  heading: 'Join the pre-launch beta',
  subheading: "We're launching Musaium in June. The first 100 testers get on the waitlist.",
  fieldEmail: 'Email address',
  fieldConsent: 'I agree to receive Musaium product updates. One-click unsubscribe.',
  consentPrivacyLink: 'See the privacy policy',
  submit: 'Sign me up',
  sending: 'Sending...',
  success: "Thanks! We've sent you a confirmation email — click the link to finalize your signup.",
  error: 'Something went wrong. Please retry in a moment.',
};

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/Email address/i), {
    target: { value: 'visitor@example.com' },
  });
  fireEvent.click(screen.getByLabelText(/I agree to receive Musaium/i));
}

function submitForm() {
  const btn = screen.getByRole('button', { name: dictEN.submit });
  const form = btn.closest('form');
  if (!form) throw new Error('expected submit button to be inside a <form>');
  fireEvent.submit(form);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BetaSignupSection (R3 §1 R2-R11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the email input + consent checkbox + hidden honeypot (R3)', () => {
    render(<BetaSignupSection dict={dictEN} locale="en" />);

    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/I agree to receive Musaium/i)).toBeInTheDocument();

    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.getAttribute('aria-hidden')).toBe('true');
    expect((honeypot as HTMLInputElement | null)?.tabIndex).toBe(-1);
  });

  it('exposes a labelled section with the heading + subheading (R2)', () => {
    const { container } = render(<BetaSignupSection dict={dictEN} locale="en" />);
    const section = container.querySelector('section#beta-signup');
    expect(section).not.toBeNull();
    expect(screen.getByRole('heading', { name: dictEN.heading })).toBeInTheDocument();
    expect(screen.getByText(dictEN.subheading)).toBeInTheDocument();
  });

  it('blocks submission and exposes validation errors when fields are empty (AC3.h)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    submitForm();

    await waitFor(() => {
      const errors = screen.getAllByRole('alert');
      // At least the email + consent validation messages must be visible.
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs to /api/leads/beta with {email, consent:true, website:""} on happy path (R6)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', mockFetch);

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/leads/beta');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'visitor@example.com',
      consent: true,
      website: '',
    });
  });

  it('shows the success message after a 202 response (R7 + AC3.e)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.success)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: dictEN.submit })).toBeNull();
  });

  it('shows the same success UX on idempotent duplicate signup (R16 anti-enumeration)', async () => {
    // BE returns 202 for both first signup and duplicate — FE must show the
    // SAME success copy in both cases so an attacker cannot enumerate the
    // waitlist via the response shape.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.success)).toBeInTheDocument();
    });
    // No leak about "already subscribed" — only the canonical success copy.
    expect(screen.queryByText(/already/i)).toBeNull();
    expect(screen.queryByText(/again/i)).toBeNull();
  });

  it('shows the sending label while pending (R9)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    );

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: dictEN.sending })).toBeDisabled();
    });
  });

  it('shows error on 5xx and preserves form values (R8 + AC3.f)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.error)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Email address/i)).toHaveValue('visitor@example.com');
    expect(screen.getByRole('button', { name: dictEN.submit })).toBeInTheDocument();
  });

  it('shows error on network reject (R8)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.error)).toBeInTheDocument();
    });
  });

  it('honeypot filled → still UX-success and body.website carries the value (R10)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', mockFetch);

    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();

    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: 'https://spam.example' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.success)).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalled();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.website).toBe('https://spam.example');
  });

  it('exposes the success/error region with aria-live="polite" (R20)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));
    render(<BetaSignupSection dict={dictEN} locale="en" />);
    fillValidForm();
    submitForm();

    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]');
      expect(live).not.toBeNull();
      expect(live?.textContent).toContain(dictEN.success);
    });
  });
});
