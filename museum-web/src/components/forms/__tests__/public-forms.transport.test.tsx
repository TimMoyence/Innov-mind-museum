import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import BetaSignupSection from '@/app/[locale]/BetaSignupSection';
import B2bContactForm from '@/app/[locale]/b2b/B2bContactForm';
import ContactForm from '@/app/[locale]/support/ContactForm';

const CSRF = 'csrf-du-visiteur-connecte';

function submit(label: string): void {
  const form = screen.getByRole('button', { name: label }).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

function headersSent(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
  return init.headers;
}

const FORMS = [
  {
    name: 'contact',
    mount: () => render(<ContactForm dict={en.support.contact} />),
    fill: () => {
      const dict = en.support.contact;
      fireEvent.change(screen.getByPlaceholderText(dict.namePlaceholder), {
        target: { value: 'Alice' },
      });
      fireEvent.change(screen.getByPlaceholderText(dict.emailPlaceholder), {
        target: { value: 'alice@museum.fr' },
      });
      fireEvent.change(screen.getByPlaceholderText(dict.messagePlaceholder), {
        target: { value: 'Help me please with my visit' },
      });
    },
    submitLabel: en.support.contact.submit,
    success: en.support.contact.success,
  },
  {
    name: 'B2B',
    mount: () => render(<B2bContactForm dict={en.landing.b2b.contact} locale="en" />),
    fill: () => {
      const dict = en.landing.b2b.contact;
      fireEvent.change(screen.getByLabelText(dict.fieldEmail), {
        target: { value: 'curator@museum.fr' },
      });
      fireEvent.change(screen.getByLabelText(dict.fieldName), { target: { value: 'Alice' } });
      fireEvent.change(screen.getByLabelText(dict.fieldMuseum), { target: { value: 'Louvre' } });
      fireEvent.change(screen.getByLabelText(dict.fieldRole), { target: { value: 'curator' } });
      fireEvent.change(screen.getByLabelText(dict.fieldMessage), {
        target: { value: 'We would like a demo for our museum.' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
    },
    submitLabel: en.landing.b2b.contact.submit,
    success: en.landing.b2b.contact.success,
  },
  {
    name: 'bêta',
    mount: () => render(<BetaSignupSection dict={en.landing.beta} locale="en" />),
    fill: () => {
      fireEvent.change(screen.getByLabelText(en.landing.beta.fieldEmail), {
        target: { value: 'visitor@museum.fr' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
    },
    submitLabel: en.landing.beta.submit,
    success: en.landing.beta.success,
  },
];

describe('M8 · un visiteur connecté peut envoyer les formulaires publics', () => {
  beforeEach(() => {
    document.cookie = `csrf_token=${CSRF}; path=/`;
  });

  afterEach(() => {
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    vi.unstubAllGlobals();
  });

  for (const form of FORMS) {
    it(`${form.name} : la requête porte le jeton CSRF du cookie, le succès s’affiche`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ accepted: true }),
      });
      vi.stubGlobal('fetch', fetchMock);
      form.mount();

      form.fill();
      submit(form.submitLabel);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(headersSent(fetchMock)['X-CSRF-Token']).toBe(CSRF);
      expect(await screen.findByText(form.success)).toBeInTheDocument();
    });
  }
});
