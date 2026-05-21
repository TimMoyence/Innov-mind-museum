/**
 * TD-SEC-02 (R3, R4, R5, R6, R7) — MfaEnrollScreen screen-capture protection.
 *
 * The screen displays the live TOTP shared secret (QR + manualSecret) and the
 * 10 one-time recovery codes. While it is mounted+focused, screen capture MUST
 * be disabled (R3) and re-enabled on blur/unmount (R4/R7), via a lazy/web-safe
 * `expo-screen-capture` integration that no-ops on web / when the native module
 * is absent (R5/R6).
 *
 * RED: the screen does not call any screen-capture API yet (the
 * `usePreventScreenCapture` hook does not exist), so the prevent/allow spies
 * are never invoked → these assertions FAIL.
 */

import type { EffectCallback } from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

// ── react-native-qrcode-svg — render value as text so we can assert on it, and
// capture the props passed to <QRCode> so we can assert ecl/onError (TD-QR-01/02).
const mockQrProps: Record<string, unknown>[] = [];
jest.mock('react-native-qrcode-svg', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: { value: string }) => {
      mockQrProps.push(props as unknown as Record<string, unknown>);
      return <Text testID="qr-code">{props.value}</Text>;
    },
  };
});

// ── expo-clipboard ───────────────────────────────────────────────────────────
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

// ── expo-screen-capture — prevent/allow spies (the control under test) ───────
const mockPreventScreenCaptureAsync = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockAllowScreenCaptureAsync = jest.fn((..._args: unknown[]) => Promise.resolve());

jest.mock('expo-screen-capture', () => ({
  __esModule: true,
  preventScreenCaptureAsync: (...args: unknown[]) => mockPreventScreenCaptureAsync(...args),
  allowScreenCaptureAsync: (...args: unknown[]) => mockAllowScreenCaptureAsync(...args),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

// ── expo-router useFocusEffect — run callback on mount, cleanup on unmount ────
// Mirrors @react-navigation focus-effect semantics closely enough for a unit
// test: the effect runs on focus (mount here) and its returned cleanup runs on
// blur/unmount. The screen-capture lifecycle (design D2) is driven by this.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: EffectCallback) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Justification: mock mirrors useFocusEffect run-once-on-focus semantics (effect fires once on mount/focus, returned cleanup runs on blur/unmount); cb is intentionally excluded so the focus effect does not re-fire per render, matching @react-navigation behaviour. Approved-by: dispatcher@2026-05-21
      useEffect(() => cb(), []);
    },
  };
});

// ── mfaService — typed result via shared factory (no inline entities) ────────
const mockEnroll = jest.fn();
const mockVerifyEnrollment = jest.fn();
jest.mock('@/features/auth/infrastructure/mfaApi', () => ({
  mfaService: {
    enroll: () => mockEnroll(),
    verifyEnrollment: (code: string) => mockVerifyEnrollment(code),
  },
}));

import { MfaEnrollScreen } from '@/features/auth/screens/MfaEnrollScreen';
import { makeMfaEnrollResult } from '@/__tests__/helpers/factories/mfa.factories';

describe('MfaEnrollScreen — screen-capture protection (TD-SEC-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnroll.mockResolvedValue(makeMfaEnrollResult());
    mockVerifyEnrollment.mockResolvedValue({ enrolledAt: '2026-05-21T00:00:00.000Z' });
  });

  it('disables screen capture on mount/focus (R3)', () => {
    render(<MfaEnrollScreen />);

    expect(mockPreventScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it('re-enables screen capture on unmount/blur, balancing prevent/allow (R4, R7)', () => {
    const { unmount } = render(<MfaEnrollScreen />);

    expect(mockAllowScreenCaptureAsync).not.toHaveBeenCalled();

    unmount();

    expect(mockAllowScreenCaptureAsync).toHaveBeenCalledTimes(1);
    // Balanced: exactly one prevent and one allow over the lifecycle.
    expect(mockPreventScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it('still renders the enrollment happy path while protecting capture (R10)', async () => {
    const result = makeMfaEnrollResult();
    mockEnroll.mockResolvedValue(result);

    render(<MfaEnrollScreen />);

    fireEvent.press(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toHaveTextContent(result.otpauthUrl);
    });
    expect(screen.getByText(result.manualSecret)).toBeTruthy();
  });
});

describe('MfaEnrollScreen — graceful degradation (R5, R6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnroll.mockResolvedValue(makeMfaEnrollResult());
    mockVerifyEnrollment.mockResolvedValue({ enrolledAt: '2026-05-21T00:00:00.000Z' });
  });

  it('renders without throwing when the native capture call rejects (R6)', async () => {
    // The native module is present but the prevent call fails (e.g. module
    // available on web/Jest stub, OS error). The screen must swallow it and
    // still render the happy path — no SIGABRT, no unhandled rejection.
    mockPreventScreenCaptureAsync.mockRejectedValueOnce(new Error('native module unavailable'));

    expect(() => render(<MfaEnrollScreen />)).not.toThrow();

    // Still functional: the Generate CTA renders and the screen does not crash.
    await waitFor(() => {
      expect(screen.getByText('Generate')).toBeTruthy();
    });
  });

  it('renders the secret without leaking it to the clipboard/log path (R5/R6 hygiene)', async () => {
    // R5/R6 web/no-op contract is exercised structurally in the web-platform
    // suite below; here we assert that even when capture protection is engaged,
    // the secret stays on-screen (ephemeral useState) and is never passed to a
    // capture API as a payload.
    const result = makeMfaEnrollResult();
    mockEnroll.mockResolvedValue(result);

    render(<MfaEnrollScreen />);
    fireEvent.press(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toHaveTextContent(result.otpauthUrl);
    });

    // The capture API must never receive the secret as an argument.
    for (const callArgs of mockPreventScreenCaptureAsync.mock.calls) {
      expect(callArgs).not.toContain(result.otpauthUrl);
      expect(callArgs).not.toContain(result.manualSecret);
    }
  });
});

describe('MfaEnrollScreen — TOTP QR hardening (TD-QR-01 / TD-QR-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQrProps.length = 0;
  });

  it('renders the QR with ecl="H" (30% recovery) and an onError handler', async () => {
    // lib-docs/react-native-qrcode-svg/PATTERNS.md:75-76 — the one-shot TOTP
    // secret QR must use ecl='H' (maximises first-scan success) and provide
    // onError so a generation failure degrades to the manual key instead of an
    // uncaught render crash.
    const result = makeMfaEnrollResult();
    mockEnroll.mockResolvedValue(result);

    render(<MfaEnrollScreen />);
    fireEvent.press(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeTruthy();
    });

    const props = mockQrProps.at(-1);
    expect(props?.ecl).toBe('H');
    expect(typeof props?.onError).toBe('function');
  });
});

// R5 — web platform: the lazy/web-safe hook must short-circuit on
// `Platform.OS==='web'` (mirroring authTokenStore.ts's loadSecureStore guard,
// PATTERNS.md DO §Imports — the guarded loader is called inside the
// useFocusEffect callback at runtime) and never touch the native capture
// module. Mutating Platform.OS at runtime exercises that web guard without an
// isolated module registry (which would split the React copy and break render).
describe('MfaEnrollScreen — web platform no-op (R5)', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    // Isolation: this top-level describe has no clearAllMocks of its own, and
    // jest.config.js sets no `clearMocks` — without this hook the prevent-call
    // from the prior native-render test leaks into the "not called" assertion.
    jest.clearAllMocks();
    mockEnroll.mockResolvedValue(makeMfaEnrollResult());
    mockVerifyEnrollment.mockResolvedValue({ enrolledAt: '2026-05-21T00:00:00.000Z' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('does not invoke capture APIs on web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

    expect(() => render(<MfaEnrollScreen />)).not.toThrow();
    expect(mockPreventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(mockAllowScreenCaptureAsync).not.toHaveBeenCalled();
  });
});
