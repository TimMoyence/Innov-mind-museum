import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// qrcode is a default import in page.tsx (`import QRCode from 'qrcode'`).
const { mockToString, mockApiPost } = vi.hoisted(() => ({
  mockToString: vi.fn<(text: string, opts: Record<string, unknown>) => Promise<string>>(),
  mockApiPost: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('qrcode', () => ({
  default: { toString: (text: string, opts: Record<string, unknown>) => mockToString(text, opts) },
}));

vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

// useAdminDict reads from a React context (throws without a provider); stub it
// with a Proxy that echoes each key, so any `t.<key>` renders deterministically.
vi.mock('@/lib/admin-dictionary', () => ({
  useAdminDict: () => ({ mfaPage: new Proxy({}, { get: (_t, prop) => String(prop) }) }),
}));

import AdminMfaPage from './page';

describe('AdminMfaPage — TOTP QR error correction (TD-QRW-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToString.mockResolvedValue('<svg></svg>');
  });

  it('encodes the enrollment otpauth:// secret URL into the QR with errorCorrectionLevel "H"', async () => {
    // lib-docs/qrcode/PATTERNS.md:76,87 — the one-shot TOTP secret QR must use
    // 'H' (30%); the silent default is 'M' (15%). It must ALSO encode the exact
    // otpauth:// URL the backend issued — a QR over a wrong/empty secret is
    // useless even with the right error-correction level, so we assert both the
    // payload (arg 0) and the options (arg 1).
    const otpauthUrl =
      'otpauth://totp/Musaium:admin%40musaium.com?secret=JBSWY3DPEHPK3PXP&issuer=Musaium&algorithm=SHA1&digits=6&period=30';
    mockApiPost.mockResolvedValue({
      otpauthUrl,
      manualSecret: 'JBSWY3DPEHPK3PXP',
      recoveryCodes: ['code-1', 'code-2'],
    });

    render(<AdminMfaPage />);
    fireEvent.click(screen.getByText('generateButton'));

    await waitFor(() => {
      expect(mockToString).toHaveBeenCalled();
    });

    const firstCall = mockToString.mock.calls[0];
    expect(firstCall).toBeDefined();

    // Arg 0 = the QR payload. This is the assertion that proves the secret is
    // encoded: the component must hand QRCode.toString the exact backend
    // otpauth URL, not a stale/empty/wrong string. If it passed '' or the
    // wrong field, this fails.
    const encodedPayload = firstCall?.[0];
    expect(encodedPayload).toBe(otpauthUrl);
    // Defence-in-depth on the URL shape: a TOTP otpauth URI carrying a secret.
    expect(encodedPayload).toMatch(/^otpauth:\/\/totp\//);
    expect(encodedPayload).toMatch(/[?&]secret=[^&]+/);

    // Arg 1 = options. The error-correction level must be 'H' (30%) for the
    // one-shot secret scan.
    expect(firstCall?.[1].errorCorrectionLevel).toBe('H');
  });
});
