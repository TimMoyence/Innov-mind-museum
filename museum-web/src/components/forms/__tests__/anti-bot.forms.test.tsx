import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import BetaSignupSection from '@/app/[locale]/BetaSignupSection';
import B2bContactForm from '@/app/[locale]/b2b/B2bContactForm';
import ContactForm from '@/app/[locale]/support/ContactForm';

const SHOWN_AT = 1_000_000;
const TRAP = 'https://spam.example';

function honeypot(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[name="website"]');
  if (!input) throw new Error('honeypot absent');
  return input;
}

function submit(label: string): void {
  const form = screen.getByRole('button', { name: label }).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

function fillBeta(): void {
  fireEvent.change(screen.getByLabelText(en.landing.beta.fieldEmail), {
    target: { value: 'visitor@example.com' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('TIM-2026-11-08-DEUX-SIGNAUX · formulaires web : délai de remplissage et champ caché', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SHOWN_AT);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('le champ caché est écarté des gestionnaires de mots de passe', () => {
    render(<ContactForm dict={en.support.contact} />);

    const input = honeypot();
    expect(screen.getByPlaceholderText(en.support.contact.namePlaceholder)).toBeInTheDocument();
    expect(input).toHaveAttribute('data-1p-ignore');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAttribute('data-bwignore');
    expect(input).toHaveAttribute('data-form-type', 'other');
    expect(input).toHaveAttribute('data-protonpass-ignore');
  });

  it('contact envoyé 30 s après affichage : fillMs vaut 30000', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm dict={en.support.contact} />);

    fireEvent.change(screen.getByPlaceholderText(en.support.contact.namePlaceholder), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByPlaceholderText(en.support.contact.emailPlaceholder), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(en.support.contact.messagePlaceholder), {
      target: { value: 'Help me please with my visit' },
    });
    vi.setSystemTime(SHOWN_AT + 30_000);
    submit(en.support.contact.submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(sentBody(fetchMock)).toMatchObject({ website: '', fillMs: 30_000 });
  });

  it('B2B envoyé 30 s après affichage : fillMs vaut 30000', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const dict = en.landing.b2b.contact;
    render(<B2bContactForm dict={dict} locale="en" />);

    fireEvent.change(screen.getByLabelText(dict.fieldEmail), {
      target: { value: 'curator@museum.example' },
    });
    fireEvent.change(screen.getByLabelText(dict.fieldName), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(dict.fieldMuseum), { target: { value: 'Louvre' } });
    fireEvent.change(screen.getByLabelText(dict.fieldRole), { target: { value: 'curator' } });
    fireEvent.change(screen.getByLabelText(dict.fieldMessage), {
      target: { value: 'We would like a demo for our museum.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    vi.setSystemTime(SHOWN_AT + 30_000);
    submit(dict.submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(sentBody(fetchMock)).toMatchObject({ website: '', fillMs: 30_000 });
  });

  it('bêta envoyée 30 s après affichage : fillMs vaut 30000', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<BetaSignupSection dict={en.landing.beta} locale="en" />);

    fillBeta();
    vi.setSystemTime(SHOWN_AT + 30_000);
    submit(en.landing.beta.submit);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(sentBody(fetchMock)).toMatchObject({ website: '', fillMs: 30_000 });
  });

  it('bêta avec champ caché rempli et serveur en erreur : le visiteur voit l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<BetaSignupSection dict={en.landing.beta} locale="en" />);

    fillBeta();
    fireEvent.change(honeypot(), { target: { value: TRAP } });
    submit(en.landing.beta.submit);

    await waitFor(() => {
      expect(screen.getByText(en.landing.beta.error)).toBeInTheDocument();
    });
    expect(screen.queryByText(en.landing.beta.success)).toBeNull();
  });

  it('bêta avec champ caché rempli et e-mail vide : les champs requis sont signalés, rien n’est envoyé', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<BetaSignupSection dict={en.landing.beta} locale="en" />);

    fireEvent.change(honeypot(), { target: { value: TRAP } });
    submit(en.landing.beta.submit);

    await waitFor(() => {
      expect(screen.getAllByText(en.landing.beta.errorValidation).length).toBeGreaterThan(0);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
