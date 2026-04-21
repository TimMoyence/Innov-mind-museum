import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactForm from '../ContactForm';
import type { Dictionary } from '@/lib/i18n';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const dictEN: Dictionary['support']['contact'] = {
  title: 'Contact us',
  namePlaceholder: 'Your name',
  emailPlaceholder: 'Your email',
  messagePlaceholder: 'Describe your question or issue...',
  submit: 'Send',
  sending: 'Sending...',
  success: 'Thank you! Your message has been sent. We\'ll get back to you as soon as possible.',
  error: 'Unable to send your message right now. Please try again in a few minutes.',
};

const dictFR: Dictionary['support']['contact'] = {
  title: 'Nous contacter',
  namePlaceholder: 'Votre nom',
  emailPlaceholder: 'Votre email',
  messagePlaceholder: 'Décrivez votre question ou problème...',
  submit: 'Envoyer',
  sending: 'Envoi...',
  success: 'Merci ! Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.',
  error: "Impossible d'envoyer votre message pour le moment. Veuillez réessayer dans quelques minutes.",
};

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
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', email: 'alice@test.com', message: 'Help me please' }),
      });
    });
  });

  it('shows sending label on button while submitting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => { /* pending */ })));

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    });
  });

  it('shows success message after successful submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    render(<ContactForm dict={dictEN} />);
    fillAndSubmit(dictEN);

    await waitFor(() => {
      expect(
        screen.getByText(/Thank you! Your message has been sent/),
      ).toBeInTheDocument();
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

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
    expect(screen.getByPlaceholderText('Décrivez votre question ou problème...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('shows French success message after FR submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    render(<ContactForm dict={dictFR} />);
    fillAndSubmit(dictFR);

    await waitFor(() => {
      expect(screen.getByText(/Merci ! Votre message a bien été envoyé/)).toBeInTheDocument();
    });
  });
});
