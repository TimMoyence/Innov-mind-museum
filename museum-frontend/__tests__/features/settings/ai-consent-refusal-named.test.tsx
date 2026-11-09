import '../../helpers/test-utils';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { consentApi } from '@/features/chat/infrastructure/consentApi';
import { SettingsAiConsentCard } from '@/features/settings/ui/SettingsAiConsentCard';

jest.mock('@/features/chat/infrastructure/consentApi', () => ({
  consentApi: {
    list: jest.fn().mockResolvedValue([]),
    grant: jest.fn().mockRejectedValue(new Error('Network Error')),
    revoke: jest.fn(),
  },
}));

jest.mock('@/features/chat/application/useAiConsent', () => ({
  clearConsentAcceptedFlag: jest.fn(),
}));

describe('M4 · un refus du serveur est nommé dans la carte Fournisseurs d’IA tiers', () => {
  it('M4 · fournisseur d’IA refusé : la carte nomme l’échec et revient à désactivé', async () => {
    render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    });
    const [firstScope] = screen.getAllByRole('switch');
    if (!firstScope) throw new Error('aucun fournisseur affiché');

    fireEvent(firstScope, 'valueChange', true);

    await waitFor(() => {
      expect(screen.queryByText('preferences.save_failed')).not.toBeNull();
    });
    expect(screen.getAllByRole('switch')[0]?.props.value).toBe(false);
  });

  it('M4 · un fournisseur refusé reste nommé quand un autre fournisseur est accepté pendant l’écriture', async () => {
    let refuseFirst: (error: Error) => void = () => undefined;
    let acceptSecond: () => void = () => undefined;
    jest
      .mocked(consentApi.grant)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            refuseFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            acceptSecond = () => {
              resolve(undefined);
            };
          }),
      );
    render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBeGreaterThan(1);
    });
    const [first, second] = screen.getAllByRole('switch');
    if (!first || !second) throw new Error('deux fournisseurs attendus');

    fireEvent(first, 'valueChange', true);
    fireEvent(second, 'valueChange', true);
    await act(async () => {
      acceptSecond();
      refuseFirst(new Error('Network Error'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText('preferences.save_failed')).not.toBeNull();
    });
  });
});
