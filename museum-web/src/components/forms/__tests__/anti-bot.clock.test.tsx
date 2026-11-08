import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import ContactForm from '@/app/[locale]/support/ContactForm';

describe('TIM-2026-11-08-DEUX-SIGNAUX · horloge qui recule', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('une horloge reculée entre affichage et envoi donne fillMs 0, jamais négatif', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
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
    vi.setSystemTime(940_000);
    const form = screen.getByRole('button', { name: en.support.contact.submit }).closest('form');
    if (!form) throw new Error('form absent');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ fillMs: 0 });
  });
});
