import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import ContactForm from '@/app/[locale]/support/ContactForm';

const dict = en.support.contact;

function fill(name: string, message: string): void {
  fireEvent.change(screen.getByPlaceholderText(dict.namePlaceholder), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(dict.emailPlaceholder), {
    target: { value: 'curator@museum.fr' },
  });
  fireEvent.change(screen.getByPlaceholderText(dict.messagePlaceholder), {
    target: { value: message },
  });
}

function submit(): void {
  const form = screen.getByRole('button', { name: dict.submit }).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

describe('L1 · contact : le nom et le message sont signalés sur leur champ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un message de 10 caractères part au serveur sans erreur de champ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm dict={dict} />);

    fill('Alice', 'Help me 10');
    submit();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Your message must be at least 10 characters.')).toBeNull();
  });

  it('un message de 9 caractères est signalé sur le champ, rien n’est envoyé', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm dict={dict} />);

    fill('Alice', 'Help me 9');
    submit();

    await waitFor(() => {
      expect(screen.getByText('Your message must be at least 10 characters.')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un nom fait d’espaces est signalé sur le champ, rien n’est envoyé', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm dict={dict} />);

    fill('   ', 'Help me please with my visit');
    submit();

    await waitFor(() => {
      expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
