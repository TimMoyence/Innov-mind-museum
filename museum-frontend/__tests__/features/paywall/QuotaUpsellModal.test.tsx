import '@/__tests__/helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';

const mockPost = jest.fn();
jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: {
    submitPaywallInterest: (payload: unknown) =>
      mockPost('/api/leads/paywall-interest', payload) as Promise<unknown>,
  },
}));

const mockAddBreadcrumb = jest.requireMock<{ addBreadcrumb: jest.Mock }>(
  '@sentry/react-native',
).addBreadcrumb;

import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';

import { makeQuotaReason as fixtureReason } from '../../helpers/factories';
import { speakAppLanguage } from '../../helpers/real-i18n';

describe('QuotaUpsellModal (R1 §1 R26-R29 + N6 + Q7)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  it('R26: renders title + body + email field + CTA from t(paywall.*) keys', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    expect(screen.getByText('paywall.modalTitle')).toBeTruthy();
    expect(screen.getByText('paywall.modalBody')).toBeTruthy();
    expect(screen.getByLabelText('paywall.fieldEmail')).toBeTruthy();
    expect(screen.getByText('paywall.submit')).toBeTruthy();
  });

  it('Q7: dismissible close button has accessibilityLabel from t(paywall.dismiss)', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    expect(screen.getByLabelText('paywall.dismiss')).toBeTruthy();
  });

  it('Q7: pressing the close button invokes onClose', () => {
    const onClose = jest.fn();
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('paywall.dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('N6: submit disabled (or no POST fired) until the consent checkbox is checked', () => {
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    fireEvent.press(screen.getByText('paywall.submit'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('R27: submit with consent checked → POST /api/leads/paywall-interest, success state, breadcrumb', async () => {
    mockPost.mockResolvedValueOnce({ data: { accepted: true } });
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/leads/paywall-interest',
      expect.objectContaining({
        email: 'free-tier@example.com',
        consent: true,
        website: '',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('paywall.success')).toBeTruthy();
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'paywall',
        message: 'paywall_email_captured',
      }),
    );
  });

  it('R28: POST failure → t(paywall.error) inline, modal stays open', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    render(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'free-tier@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.error')).toBeTruthy();
    });
    expect(screen.getByText('paywall.modalTitle')).toBeTruthy();
  });

  it('R29: every locale ships a non-empty paywall namespace (en + fr)', () => {
    const en = (
      require('@/shared/locales/en/translation.json') as { paywall: Record<string, string> }
    ).paywall;
    const fr = (
      require('@/shared/locales/fr/translation.json') as { paywall: Record<string, string> }
    ).paywall;
    const required = [
      'modalTitle',
      'modalBody',
      'fieldEmail',
      'submit',
      'sending',
      'success',
      'error',
      'dismiss',
      'consent',
      'resetsOn',
    ];
    for (const key of required) {
      expect(en[key]).toBeDefined();
      expect(fr[key]).toBeDefined();
      expect(typeof en[key]).toBe('string');
      expect(typeof fr[key]).toBe('string');
    }
  });
});

describe('QuotaUpsellModal F2 — state reset on visible transition (bug_005)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  it('F2.A: email field is empty on reopen after typing + close', () => {
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    expect(screen.getByLabelText('paywall.fieldEmail').props.value).toBe('user1@example.com');

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    expect(screen.getByLabelText('paywall.fieldEmail').props.value).toBe('');
  });

  it('F2.B: consent checkbox is unchecked on reopen after ticking + close', () => {
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    expect(screen.getByLabelText('paywall.consent').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    expect(screen.getByLabelText('paywall.consent').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false }),
    );
  });

  it('F2.C: success banner not visible on reopen after a prior successful submit', async () => {
    mockPost.mockResolvedValueOnce({ data: { accepted: true } });
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.success')).toBeTruthy();
    });

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    expect(screen.queryByText('paywall.success')).toBeNull();
  });

  it('F2.D: error banner not visible on reopen after a prior failed submit', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    fireEvent.changeText(screen.getByLabelText('paywall.fieldEmail'), 'user1@example.com');
    fireEvent.press(screen.getByLabelText('paywall.consent'));
    fireEvent.press(screen.getByText('paywall.submit'));

    await waitFor(() => {
      expect(screen.getByText('paywall.error')).toBeTruthy();
    });

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    expect(screen.queryByText('paywall.error')).toBeNull();
  });

  it('F2.E: honeypot field is empty on reopen after a bot-fill simulation', () => {
    const findHoneypot = (): ReturnType<typeof screen.UNSAFE_getAllByType>[number] => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const honeypot = inputs.find((input) => {
        const style = input.props.style as { display?: string } | undefined;
        return style?.display === 'none';
      });
      if (!honeypot) {
        throw new Error('honeypot TextInput not found via UNSAFE_getAllByType + style filter');
      }
      return honeypot;
    };

    const { rerender } = render(
      <QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />,
    );

    fireEvent.changeText(findHoneypot(), 'bot-tripped-this');
    expect(findHoneypot().props.value).toBe('bot-tripped-this');

    rerender(<QuotaUpsellModal visible={false} reason={fixtureReason()} onClose={jest.fn()} />);
    rerender(<QuotaUpsellModal visible reason={fixtureReason()} onClose={jest.fn()} />);

    expect(findHoneypot().props.value).toBe('');
  });
});

describe('QuotaUpsellModal resetAt formatting (F3 §1 R3..R8)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  it('F3.A: raw ISO 2026-06-01T00:00:00.000Z is NOT rendered anywhere', () => {
    speakAppLanguage('en');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryAllByText(/2026-06-01T00:00:00\.000Z/).length).toBe(0);
  });

  it('F3.B: EN locale renders human-readable "June" + "2026"', () => {
    speakAppLanguage('en');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryAllByText(/June.*2026|2026.*June/).length).toBeGreaterThan(0);
  });

  it('F3.C: FR locale renders human-readable "juin" + "2026"', () => {
    speakAppLanguage('fr');
    render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryAllByText(/juin.*2026|2026.*juin/).length).toBeGreaterThan(0);
  });

  it('DEC-2026-11-09 · F3.D: invalid ISO hides the reset line, no raw value, no "Invalid Date"', () => {
    speakAppLanguage('en');
    expect(() =>
      render(
        <QuotaUpsellModal
          visible
          reason={fixtureReason({ resetAt: 'NOT-A-VALID-DATE' })}
          onClose={jest.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.queryAllByText(/NOT-A-VALID-DATE/).length).toBe(0);
    expect(screen.queryAllByText(/Resets on/).length).toBe(0);

    expect(screen.queryAllByText(/Invalid Date/).length).toBe(0);
  });

  it('F3.E: re-render with identical resetAt yields identical formatted output', () => {
    speakAppLanguage('en');
    const { rerender } = render(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    const firstHit = screen.queryAllByText(/June.*2026|2026.*June/);
    expect(firstHit.length).toBeGreaterThan(0);
    const firstNode = firstHit[0];
    if (!firstNode) throw new Error('F3.E: expected at least one June 2026 hit on first render');
    const firstText = JSON.stringify(firstNode.props.children);

    rerender(
      <QuotaUpsellModal
        visible
        reason={fixtureReason({ resetAt: '2026-06-01T00:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );
    const secondHit = screen.queryAllByText(/June.*2026|2026.*June/);
    expect(secondHit.length).toBeGreaterThan(0);
    const secondNode = secondHit[0];
    if (!secondNode) throw new Error('F3.E: expected at least one June 2026 hit on second render');
    expect(JSON.stringify(secondNode.props.children)).toEqual(firstText);
  });
});
