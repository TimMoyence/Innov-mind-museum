import '../../helpers/test-utils';
import { render, screen, waitFor } from '@testing-library/react-native';

import { speakAppLanguage } from '../../helpers/real-i18n';

const mockList = jest.fn<Promise<unknown[]>, []>();
jest.mock('@/features/chat/infrastructure/consentApi', () => ({
  consentApi: {
    list: () => mockList(),
    grant: jest.fn(),
    revoke: jest.fn(),
  },
}));

jest.mock('@/features/chat/application/useAiConsent', () => ({
  clearConsentAcceptedFlag: jest.fn(),
}));

import { SettingsAiConsentCard } from '@/features/settings/ui/SettingsAiConsentCard';

const consent = (grantedAt: string) => ({
  id: 1,
  scope: 'third_party_ai_text_openai',
  version: '2026-06-01',
  grantedAt,
  revokedAt: null,
  source: 'ui',
});

describe('Réglages — date d’un consentement IA', () => {
  beforeEach(() => {
    speakAppLanguage('fr');
  });

  it('AUDIT-2026-11-09 · une date lisible se lit en français', async () => {
    mockList.mockResolvedValue([consent('2026-05-16T10:00:00.000Z')]);

    render(<SettingsAiConsentCard />);

    await waitFor(() => {
      expect(screen.getByText(/16 mai 2026/)).toBeTruthy();
    });
  });

  it('AUDIT-2026-11-09 · une date illisible ne s’affiche jamais brute', async () => {
    mockList.mockResolvedValue([consent('NOT-A-DATE')]);

    render(<SettingsAiConsentCard />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    expect(screen.queryByText(/NOT-A-DATE/)).toBeNull();
  });
});
