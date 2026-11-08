import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import en from '@/dictionaries/en.json';
import fr from '@/dictionaries/fr.json';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=tok_reset'),
}));

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn(),
}));

function submitTooShort(dict: typeof en.resetPassword): void {
  fireEvent.change(screen.getByPlaceholderText(dict.newPassword), { target: { value: 'short' } });
  fireEvent.change(screen.getByPlaceholderText(dict.confirmPassword), {
    target: { value: 'short' },
  });
  const form = screen.getByPlaceholderText(dict.newPassword).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

describe('L3 · réinitialisation web : le message « trop court » affiche la borne partagée', () => {
  it('le texte reçoit la borne à l’affichage', () => {
    const dict = { ...en.resetPassword, passwordTooShort: 'At least {min} please' };
    render(<ResetPasswordForm dict={dict} locale="en" />);

    submitTooShort(dict);

    expect(screen.getByText('At least 8 please')).toBeInTheDocument();
  });

  it.each([
    ['en', en.resetPassword],
    ['fr', fr.resetPassword],
  ])('%s : le dictionnaire laisse la borne au code', (_locale, dict) => {
    expect(dict.passwordTooShort).toContain('{min}');
    expect(dict.passwordTooShort).not.toMatch(/\d/);
  });
});
