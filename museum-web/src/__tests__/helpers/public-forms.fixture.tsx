import { fireEvent, render, screen } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import BetaSignupSection from '@/app/[locale]/BetaSignupSection';
import B2bContactForm from '@/app/[locale]/b2b/B2bContactForm';
import ContactForm from '@/app/[locale]/support/ContactForm';

export function submitForm(label: string): void {
  const form = screen.getByRole('button', { name: label }).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

function fillContact(email: string): void {
  const dict = en.support.contact;
  fireEvent.change(screen.getByPlaceholderText(dict.namePlaceholder), {
    target: { value: 'Alice' },
  });
  fireEvent.change(screen.getByPlaceholderText(dict.emailPlaceholder), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText(dict.messagePlaceholder), {
    target: { value: 'Help me please with my visit' },
  });
}

function fillB2b(email: string): void {
  const dict = en.landing.b2b.contact;
  fireEvent.change(screen.getByLabelText(dict.fieldEmail), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(dict.fieldName), { target: { value: 'Alice' } });
  fireEvent.change(screen.getByLabelText(dict.fieldMuseum), { target: { value: 'Louvre' } });
  fireEvent.change(screen.getByLabelText(dict.fieldRole), { target: { value: 'curator' } });
  fireEvent.change(screen.getByLabelText(dict.fieldMessage), {
    target: { value: 'We would like a demo for our museum.' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

function fillBeta(email: string): void {
  fireEvent.change(screen.getByLabelText(en.landing.beta.fieldEmail), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

export const PUBLIC_FORMS = [
  {
    name: 'contact',
    mount: () => render(<ContactForm dict={en.support.contact} />),
    fill: fillContact,
    submitLabel: en.support.contact.submit,
    errorEmail: en.support.contact.errorEmail,
  },
  {
    name: 'B2B',
    mount: () => render(<B2bContactForm dict={en.landing.b2b.contact} locale="en" />),
    fill: fillB2b,
    submitLabel: en.landing.b2b.contact.submit,
    errorEmail: en.landing.b2b.contact.errorEmail,
  },
  {
    name: 'bêta',
    mount: () => render(<BetaSignupSection dict={en.landing.beta} locale="en" />),
    fill: fillBeta,
    submitLabel: en.landing.beta.submit,
    errorEmail: en.landing.beta.errorEmail,
  },
];
