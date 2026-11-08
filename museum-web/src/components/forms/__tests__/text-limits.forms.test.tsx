import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import NewMuseumPage from '@/app/[locale]/admin/museums/new/page';
import B2bContactForm from '@/app/[locale]/b2b/B2bContactForm';
import ContactForm from '@/app/[locale]/support/ContactForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const EMOJI = '🏛';

function typeInto(field: HTMLElement, value: string): string {
  fireEvent.change(field, { target: { value } });
  return (field as HTMLInputElement).value;
}

describe('L3 · les champs du site comptent en caractères, comme le serveur', () => {
  it('nouveau musée : le nom garde 200 emoji sur 201 saisis', () => {
    render(<NewMuseumPage />);

    expect(typeInto(screen.getByLabelText('Name'), EMOJI.repeat(201))).toBe(EMOJI.repeat(200));
  });

  it('nouveau musée : la description garde 2 000 emoji sur 2 001 saisis', () => {
    render(<NewMuseumPage />);

    expect(typeInto(screen.getByLabelText('Description (optional)'), EMOJI.repeat(2001))).toBe(
      EMOJI.repeat(2000),
    );
  });

  it('contact : le nom garde 120 caractères sur 121 saisis, le message 5 000 sur 5 001', () => {
    render(<ContactForm dict={en.support.contact} />);

    expect(
      typeInto(screen.getByPlaceholderText(en.support.contact.namePlaceholder), 'n'.repeat(121)),
    ).toBe('n'.repeat(120));
    expect(
      typeInto(
        screen.getByPlaceholderText(en.support.contact.messagePlaceholder),
        'm'.repeat(5001),
      ),
    ).toBe('m'.repeat(5000));
  });

  it('B2B : le message garde 5 000 emoji sur 5 001 saisis', () => {
    render(<B2bContactForm dict={en.landing.b2b.contact} locale="en" />);

    expect(
      typeInto(screen.getByLabelText(en.landing.b2b.contact.fieldMessage), EMOJI.repeat(5001)),
    ).toBe(EMOJI.repeat(5000));
  });

  it('une saisie sous la borne reste intacte', () => {
    render(<B2bContactForm dict={en.landing.b2b.contact} locale="en" />);

    expect(typeInto(screen.getByLabelText(en.landing.b2b.contact.fieldMuseum), 'Louvre')).toBe(
      'Louvre',
    );
  });
});
