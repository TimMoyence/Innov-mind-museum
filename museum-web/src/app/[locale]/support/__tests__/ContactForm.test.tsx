import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactForm from '../ContactForm';
import { acceptedResponse, serverErrorResponse } from '@/__tests__/helpers/http-responses.fixture';
import en from '@/dictionaries/en.json';
import fr from '@/dictionaries/fr.json';
import type { Dictionary } from '@/lib/i18n';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const dictEN: Dictionary['support']['contact'] = en.support.contact;
const dictFR: Dictionary['support']['contact'] = fr.support.contact;

// ── Helper ────────────────────────────────────────────────────────────────────

function fillAndSubmit(dict: Dictionary['support']['contact']) {
  fireEvent.change(screen.getByPlaceholderText(dict.namePlaceholder), {
    target: { value: 'Alice' },
  });
  fireEvent.change(screen.getByPlaceholderText(dict.emailPlaceholder), {
    target: { value: 'alice@test.com' },
  });
  fireEvent.change(screen.getByPlaceholderText(dict.messagePlaceholder), {
    target: { value: 'Help me please' },
  });
  const btn = screen.getByRole('button', { name: dict.submit });
  fireEvent.submit(btn.closest('form') as HTMLFormElement);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ContactForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all form fields and submit button (EN)', () => {
    render(<ContactForm dict={dictEN} />);

    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe your question or issue...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('calls /api/support/contact with correct JSON body on submit', async () => {
    const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);

    render(<ContactForm dict={dictEN} />);
    vi.setSystemTime(1_042_000);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: 'Alice',
          email: 'alice@test.com',
          message: 'Help me please',
          website: '',
          fillMs: 42_000,
        }),
      });
    });
    vi.useRealTimers();
  });

  it('BOT-CONTACT-2026-11-08 · le champ caché website est hors de portée d’un humain', () => {
    render(<ContactForm dict={dictEN} />);

    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]');
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(honeypot).not.toBeNull();
    expect(honeypot?.getAttribute('aria-hidden')).toBe('true');
    expect(honeypot?.tabIndex).toBe(-1);
  });

  it('BOT-CONTACT-2026-11-08 · un robot qui remplit le champ caché l’envoie au serveur', async () => {
    const mockFetch = vi.fn().mockResolvedValue(acceptedResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<ContactForm dict={dictEN} />);
    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).not.toBeNull();
    fireEvent.change(honeypot as HTMLInputElement, { target: { value: 'https://spam.example' } });
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ website: 'https://spam.example' });
  });

  it('shows sending label on button while submitting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* pending */
          }),
      ),
    );

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    });
  });

  it('shows success message after successful submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(acceptedResponse()));

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(screen.getByText(/Thank you! Your message has been sent/)).toBeInTheDocument();
    });

    // Form fields should be gone (success state replaces form)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('shows error message when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(screen.getByText(/Unable to send your message right now/)).toBeInTheDocument();
    });

    // Form remains visible so the user can retry
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('shows error message when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverErrorResponse()));

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(screen.getByText(/Unable to send your message right now/)).toBeInTheDocument();
    });
  });

  it('renders French labels when given FR dictionary', () => {
    render(<ContactForm dict={dictFR} />);

    expect(screen.getByPlaceholderText('Votre nom')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Votre email')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Décrivez votre question ou problème...'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('shows French success message after FR submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(acceptedResponse()));

    render(<ContactForm dict={dictFR} />);
    fillAndSubmit(dictFR);

    await waitFor(() => {
      expect(screen.getByText(/Merci ! Votre message a bien été envoyé/)).toBeInTheDocument();
    });
  });
});
