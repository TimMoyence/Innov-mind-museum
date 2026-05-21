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

  it('generates the admin 2FA QR with errorCorrectionLevel "H"', async () => {
    // lib-docs/qrcode/PATTERNS.md:76,87 — the one-shot TOTP secret QR must use
    // 'H' (30%); the silent default is 'M' (15%).
    mockApiPost.mockResolvedValue({
      otpauthUrl: 'otpauth://totp/Musaium?secret=ABCDEFGH',
      manualSecret: 'ABCDEFGH',
      recoveryCodes: ['code-1', 'code-2'],
    });

    render(<AdminMfaPage />);
    fireEvent.click(screen.getByText('generateButton'));

    await waitFor(() => {
      expect(mockToString).toHaveBeenCalled();
    });

    const firstCall = mockToString.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[1].errorCorrectionLevel).toBe('H');
  });
});
