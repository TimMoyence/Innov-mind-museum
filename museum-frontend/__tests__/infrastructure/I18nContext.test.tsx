import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'fr' }]),
}));

jest.mock('i18next', () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(),
}));

jest.mock('@/shared/config/supportedLocales', () => ({
  toSupportedLocale: (code: string) => {
    const supported = ['en', 'fr', 'ar'];
    return supported.includes(code) ? code : 'en';
  },
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  setLocale: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/shared/i18n/rtl', () => ({
  needsRTLReload: (from: string, to: string) => to === 'ar',
  applyRTLLayout: jest.fn(),
}));

import { I18nProvider, useI18n } from '@/shared/i18n/I18nContext';
import i18n from 'i18next';
import { setLocale } from '@/shared/infrastructure/httpClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestConsumer = () => {
  const { language, setLanguage } = useI18n();
  return (
    <>
      <Text testID="lang">{language}</Text>
      <Pressable
        testID="set-fr"
        onPress={() => {
          setLanguage('fr');
        }}
      />
      <Pressable
        testID="set-en"
        onPress={() => {
          setLanguage('en');
        }}
      />
      <Pressable
        testID="set-ar"
        onPress={() => {
          setLanguage('ar' as 'en');
        }}
      />
    </>
  );
};

describe('I18nContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('detects device language on mount when no stored preference', async () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('lang').props.children).toBe('fr');
    });
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
    expect(setLocale).toHaveBeenCalledWith('fr');
  });

  it('uses stored locale preference when available', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('en');

    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('lang').props.children).toBe('en');
    });
  });

  it('changes language via setLanguage', async () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('lang').props.children).toBe('fr');
    });

    fireEvent.press(screen.getByTestId('set-en'));

    await waitFor(() => {
      expect(screen.getByTestId('lang').props.children).toBe('en');
    });
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
    expect(setLocale).toHaveBeenCalledWith('en');
  });

  it('persists the device-detected language when none was chosen', async () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('musaium.runtime.defaultLocale', 'fr');
    });
  });

  it('handles RTL language switch', async () => {
    const { applyRTLLayout } = require('@/shared/i18n/rtl') as { applyRTLLayout: jest.Mock };

    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('lang').props.children).toBe('fr');
    });

    fireEvent.press(screen.getByTestId('set-ar'));

    await waitFor(() => {
      expect(applyRTLLayout).toHaveBeenCalledWith('ar');
    });
  });

  it('handles storage read failure gracefully', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('fail'));

    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('lang')).toBeTruthy();
    });
  });

  it('provides default noop setLanguage outside provider', () => {
    const Orphan = () => {
      const { language, setLanguage } = useI18n();
      return (
        <>
          <Text testID="orphan-lang">{language}</Text>
          <Pressable
            testID="orphan-set"
            onPress={() => {
              setLanguage('fr');
            }}
          />
        </>
      );
    };

    render(<Orphan />);
    expect(screen.getByTestId('orphan-lang').props.children).toBe('en');
    fireEvent.press(screen.getByTestId('orphan-set'));
  });
});
