import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import '@/shared/i18n/i18n';
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { I18nProvider, useI18n } from '@/shared/i18n/I18nContext';
import { makeCreateSessionResponse } from '@/__tests__/helpers/factories/session.factories';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const mockCreateSession = jest.fn();
jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: { createSession: (...args: unknown[]) => mockCreateSession(...args) },
}));

jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => ({
    latitude: null,
    longitude: null,
    status: 'idle',
    precision: null,
    error: null,
  }),
}));

jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: { detectMuseum: jest.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

const chooseFrench = async (setLanguage: (lang: 'fr') => void) => {
  await act(async () => {
    setLanguage('fr');
    await Promise.resolve();
  });
};

describe('M2 · un seul réglage de langue', () => {
  it('M2 · après le choix de Français, Réglages et le chat lisent fr', async () => {
    const { result } = renderHook(() => ({ i18n: useI18n(), settings: useRuntimeSettings() }), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.i18n.language).toBe('en');
    });

    await chooseFrench(result.current.i18n.setLanguage);

    expect(result.current.settings.locale).toBe('fr');
  });

  it('M2 · une conversation démarrée après le choix de Français est créée en fr', async () => {
    mockCreateSession.mockResolvedValueOnce(makeCreateSessionResponse());
    const { result } = renderHook(() => ({ i18n: useI18n(), start: useStartConversation() }), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.i18n.language).toBe('en');
    });

    await chooseFrench(result.current.i18n.setLanguage);
    await act(async () => {
      await result.current.start.startConversation();
    });

    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ locale: 'fr' }));
  });
});
