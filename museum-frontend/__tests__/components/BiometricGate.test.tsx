/**
 * P6 — BiometricGate auto-prompt behaviour (TDD).
 *
 * The user opens the app → Face ID / Touch ID prompt fires automatically.
 * Tap-to-unlock button is the fallback path, shown only after a failure
 * or cancellation. This is the desired UX:
 *
 *   "j'aimerais juste j'ouvre l'app, face id se déclenche, et j'arrive
 *    sur l'app"
 *
 * Red-first: every test in this suite fails on the current implementation
 * because BiometricGate (currently inline in app/_layout.tsx) only fires
 * `authenticate()` from a button onPress.
 *
 * Uses `@testing-library/react-native` and the existing AuthContext +
 * useBiometricAuth mocking pattern (UFR-002 — no inline ad-hoc mocks).
 */

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act, screen, fireEvent } from '@testing-library/react-native';

type RefreshResult =
  | { kind: 'success'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'transient' };

const mockAuthenticate = jest.fn<Promise<boolean>, []>();
const mockUnlockBiometric = jest.fn();
const mockRunAuthRefresh = jest.fn<Promise<RefreshResult>, []>();
const authState = { locked: true };

jest.mock('@/features/auth/application/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    isAvailable: true,
    isEnabled: true,
    biometricLabel: 'Face ID',
    isChecking: false,
    authenticate: mockAuthenticate,
    enable: jest.fn(),
    disable: jest.fn(),
  }),
}));

jest.mock('@/features/auth/application/AuthContext', () => ({
  useAuth: () => ({
    get isBiometricLocked() {
      return authState.locked;
    },
    unlockBiometric: mockUnlockBiometric,
  }),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  runAuthRefresh: () => mockRunAuthRefresh(),
}));

jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      pageGradient: ['#fff', '#fff'],
      primary: '#000',
      primaryContrast: '#fff',
      textPrimary: '#000',
      textSecondary: '#444',
      error: '#f00',
    },
    isDark: false,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { BiometricGate } from '@/features/auth/ui/BiometricGate';

const TestChild = () => <Text testID="protected-content">protected</Text>;

describe('BiometricGate (P6 — auto-prompt UX)', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockUnlockBiometric.mockReset();
    mockRunAuthRefresh.mockReset();
    // Default: refresh succeeds. Tests that exercise alternate refresh
    // outcomes (invalid / transient) override per-case.
    mockRunAuthRefresh.mockResolvedValue({ kind: 'success', accessToken: 'tok' });
    authState.locked = true;
  });

  describe('when isBiometricLocked = true', () => {
    it('automatically calls authenticate() on mount — no button tap required', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });
    });

    it('calls unlockBiometric() when the auto-prompt succeeds', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockUnlockBiometric).toHaveBeenCalledTimes(1);
      });
    });

    it('does not render protected children before unlock succeeds', () => {
      mockAuthenticate.mockReturnValueOnce(new Promise(() => {})); // never resolves

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      expect(screen.queryByTestId('protected-content')).toBeNull();
    });

    it('shows the manual retry button only after the auto-prompt is rejected', async () => {
      mockAuthenticate.mockResolvedValueOnce(false);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });

      // Fallback retry surface visible after the user dismissed Face ID.
      const retry = await screen.findByLabelText('biometric.unlock');
      expect(retry).toBeTruthy();
      expect(mockUnlockBiometric).not.toHaveBeenCalled();
    });

    it('retries via the fallback button when the user taps it', async () => {
      mockAuthenticate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });

      const retry = await screen.findByLabelText('biometric.unlock');
      await act(async () => {
        await Promise.resolve();
        fireEvent.press(retry);
      });

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(mockUnlockBiometric).toHaveBeenCalledTimes(1);
      });
    });

    it('does not loop authenticate() — auto-prompt fires exactly once per locked session', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);

      const { rerender } = render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      // Force a re-render while still in the locked state — the effect
      // must NOT spawn a second prompt.
      rerender(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });
    });

    it('re-arms the auto-prompt when the session re-locks (background → re-lock → foreground)', async () => {
      mockAuthenticate.mockResolvedValue(true);

      const { rerender } = render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );
      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });

      // Unlock — autoPromptedRef must reset so the next lock cycle re-fires.
      authState.locked = false;
      rerender(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      // Re-lock (user backgrounded the app and returned, or another path
      // in AuthContext flipped isBiometricLocked back to true).
      authState.locked = true;
      rerender(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('preflight refresh (Face ID → backend session validation)', () => {
    it('runs runAuthRefresh exactly once after a successful Face ID prompt', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockRunAuthRefresh).toHaveBeenCalledTimes(1);
      });
    });

    it('skips runAuthRefresh when Face ID fails — no point refreshing if user did not unlock', async () => {
      mockAuthenticate.mockResolvedValueOnce(false);

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      });
      expect(mockRunAuthRefresh).not.toHaveBeenCalled();
      expect(mockUnlockBiometric).not.toHaveBeenCalled();
    });

    it('still unlocks when refresh returns invalid — unauthorizedHandler navigates to /auth, gate must stop covering the Stack', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);
      mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'invalid' });

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockUnlockBiometric).toHaveBeenCalledTimes(1);
      });
    });

    it('still unlocks when refresh returns transient — offline tolerance, next online request will retry', async () => {
      mockAuthenticate.mockResolvedValueOnce(true);
      mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'transient' });

      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      await waitFor(() => {
        expect(mockUnlockBiometric).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('when isBiometricLocked = false', () => {
    beforeEach(() => {
      authState.locked = false;
    });

    it('renders children directly without prompting', () => {
      render(
        <BiometricGate>
          <TestChild />
        </BiometricGate>,
      );

      expect(screen.getByTestId('protected-content')).toBeTruthy();
      expect(mockAuthenticate).not.toHaveBeenCalled();
    });
  });
});
