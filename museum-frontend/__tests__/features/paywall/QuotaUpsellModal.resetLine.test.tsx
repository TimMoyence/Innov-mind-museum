import '@/__tests__/helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { makeQuotaReason } from '../../helpers/factories';
import { speakAppLanguage } from '../../helpers/real-i18n';

jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: { submitPaywallInterest: jest.fn() },
}));

import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';

describe('Modale de quota — la ligne de réinitialisation', () => {
  it('AUDIT-2026-11-09 · une date lisible se lit « Réinitialisation le 1 décembre 2026 »', () => {
    speakAppLanguage('fr');

    render(
      <QuotaUpsellModal
        visible
        reason={makeQuotaReason({ resetAt: '2026-12-01T12:00:00.000Z' })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Réinitialisation le 1 décembre 2026')).toBeTruthy();
  });

  it('DEC-2026-11-09 · une date illisible ne laisse ni ligne ni valeur brute', () => {
    speakAppLanguage('fr');

    render(
      <QuotaUpsellModal
        visible
        reason={makeQuotaReason({ resetAt: 'NOT-A-VALID-DATE' })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('quota-upsell-dismiss')).toBeTruthy();
    expect(screen.queryByText(/Réinitialisation/)).toBeNull();
    expect(screen.queryByText(/NOT-A-VALID-DATE/)).toBeNull();
  });

  it('AUDIT-2026-11-09 · sans date, aucune ligne « Réinitialisation le »', () => {
    speakAppLanguage('fr');

    render(
      <QuotaUpsellModal visible reason={makeQuotaReason({ resetAt: '' })} onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('quota-upsell-dismiss')).toBeTruthy();
    expect(screen.queryByText(/Réinitialisation/)).toBeNull();
  });
});
