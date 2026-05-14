/**
 * R4 RED tests — B2bContactForm (client component).
 *
 * Pins R4 §1 R6-R11 + §1 R17 (a11y for live region) + AC3(a-i)
 * down BEFORE implementation.
 *
 * - 6 visible labelled inputs : email / name / museum / role(select) / message / consent
 * - 1 hidden honeypot input `website` (NOT visible / not in tab order)
 * - empty submit → 5 validation errors visible (one per required field)
 * - happy path : POST `/api/leads/b2b` w/ correct JSON, then success screen
 * - 5xx response : error message displayed, form values preserved (not cleared)
 * - honeypot filled → submission still shows success (silent accept, R10)
 *
 * R19 Sentry breadcrumb deferred V1.1 (not covered by tests at this layer).
 *
 * MUST FAIL at baseline `bc49afee` — `B2bContactForm.tsx` does not exist yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import B2bContactForm from '../B2bContactForm';

// ── i18n fixture (mirrors R4.md §3.5) ────────────────────────────────────────

const dictEN = {
  title: 'Get in touch',
  subtitle: 'Tell us about your museum.',
  fieldEmail: 'Email',
  fieldName: 'Your name',
  fieldMuseum: 'Museum name',
  fieldRole: 'Your role',
  roleOptions: {
    director: 'Director',
    curator: 'Curator',
    digital: 'Digital lead',
    other: 'Other',
  },
  fieldMessage: 'Message',
  fieldConsent: 'I agree to be contacted about Musaium.',
  consentPrivacyLink: 'Privacy policy',
  submit: 'Send',
  sending: 'Sending...',
  success: 'Thanks — we will reply within two business days.',
  error: 'Unable to send right now. Please retry.',
  errorValidation: 'Please complete every required field.',
};

// Helper — fill all visible required fields with valid values.
function fillAllRequired() {
  fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'sales@museum.fr' } });
  fireEvent.change(screen.getByLabelText(/Your name/i), { target: { value: 'Alice Curator' } });
  fireEvent.change(screen.getByLabelText(/Museum name/i), {
    target: { value: 'Louvre Lens' },
  });
  fireEvent.change(screen.getByLabelText(/Your role/i), { target: { value: 'director' } });
  fireEvent.change(screen.getByLabelText(/Message/i), {
    target: { value: 'We would like to talk to you about Musaium.' },
  });
  fireEvent.click(screen.getByLabelText(/I agree to be contacted/i));
}

function submitForm() {
  const btn = screen.getByRole('button', { name: dictEN.submit });
  const form = btn.closest('form');
  if (!form) throw new Error('expected submit button to be inside a <form>');
  fireEvent.submit(form);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('B2bContactForm (R4 §1 R6-R11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the 6 visible required inputs + the hidden honeypot (R6)', () => {
    render(<B2bContactForm dict={dictEN} locale="en" />);

    // visible inputs
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Museum name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/I agree to be contacted/i)).toBeInTheDocument();

    // honeypot exists, but is aria-hidden + tabIndex=-1 + not focusable
    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.getAttribute('aria-hidden')).toBe('true');
    expect((honeypot as HTMLInputElement | null)?.tabIndex).toBe(-1);
  });

  it('blocks submission and shows 5 validation errors when fields are empty (AC3)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    render(<B2bContactForm dict={dictEN} locale="en" />);
    submitForm();

    // expect 5 visible per-field error messages (email/name/museum/role/message).
    // Spec leaves the exact copy to T2 but they must all be visible.
    await waitFor(() => {
      const errors = screen.getAllByRole('alert');
      expect(errors.length).toBeGreaterThanOrEqual(5);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs to /api/leads/b2b with the correct JSON body on happy path (R7)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', mockFetch);

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/leads/b2b');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'sales@museum.fr',
      name: 'Alice Curator',
      museum: 'Louvre Lens',
      role: 'director',
      message: 'We would like to talk to you about Musaium.',
    });
  });

  it('shows the success message after a 2xx response (R7 + AC3.e)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.success)).toBeInTheDocument();
    });
    // Submit button is replaced by the success state
    expect(screen.queryByRole('button', { name: dictEN.submit })).toBeNull();
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

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: dictEN.sending })).toBeDisabled();
    });
  });

  it('keeps form values intact and shows error on 5xx (R8 + AC3.f)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.error)).toBeInTheDocument();
    });

    // Form remains so the user can retry; the value the user typed is still there.
    expect(screen.getByLabelText(/Email/i)).toHaveValue('sales@museum.fr');
    expect(screen.getByLabelText(/Museum name/i)).toHaveValue('Louvre Lens');
    expect(screen.getByRole('button', { name: dictEN.submit })).toBeInTheDocument();
  });

  it('shows error on network reject and preserves form values (R8)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      expect(screen.getByText(dictEN.error)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Your name/i)).toHaveValue('Alice Curator');
  });

  it('honeypot filled → still UX-success but body.website is the honeypot (R10)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', mockFetch);

    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();

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

  it('exposes the success/error region with aria-live="polite" (R17)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));
    render(<B2bContactForm dict={dictEN} locale="en" />);
    fillAllRequired();
    submitForm();

    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]');
      expect(live).not.toBeNull();
      expect(live?.textContent).toContain(dictEN.success);
    });
  });
});
