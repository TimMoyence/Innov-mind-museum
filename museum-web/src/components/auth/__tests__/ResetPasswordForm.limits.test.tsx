import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TEXT_LIMITS } from '@musaium/shared/validation';

import en from '@/dictionaries/en.json';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

const mockApiPost = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=tok_reset'),
}));

vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
}));

const dict = en.resetPassword;

function submit(password: string): void {
  fireEvent.change(screen.getByPlaceholderText(dict.newPassword), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText(dict.confirmPassword), {
    target: { value: password },
  });
  const form = screen.getByPlaceholderText(dict.newPassword).closest('form');
  if (!form) throw new Error('form absent');
  fireEvent.submit(form);
}

describe('L3 · réinitialisation web : la borne du mot de passe est celle du serveur', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({});
  });

  it('4 emoji (4 caractères) : trop court, signalé, rien n’est envoyé', async () => {
    render(<ResetPasswordForm dict={dict} locale="en" />);

    submit('😀😀😀😀');

    await waitFor(() => {
      expect(
        screen.getByText(dict.passwordTooShort.replace('{min}', String(TEXT_LIMITS.password.min))),
      ).toBeInTheDocument();
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('129 caractères saisis : 128 partent au serveur', async () => {
    render(<ResetPasswordForm dict={dict} locale="en" />);

    submit('p'.repeat(129));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/auth/reset-password', {
        token: 'tok_reset',
        newPassword: 'p'.repeat(128),
      });
    });
  });
});
