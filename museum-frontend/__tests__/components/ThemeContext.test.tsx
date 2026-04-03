import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import * as RN from 'react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '@/shared/ui/ThemeContext';

const useColorSchemeSpy = jest.spyOn(RN, 'useColorScheme');

const TestConsumer = () => {
  const { mode, isDark, setMode } = useTheme();
  return (
    <>
      <Text testID="mode">{mode}</Text>
      <Text testID="isDark">{String(isDark)}</Text>
      <Pressable testID="set-dark" onPress={() => { setMode('dark'); }} />
      <Pressable testID="set-light" onPress={() => { setMode('light'); }} />
      <Pressable testID="set-system" onPress={() => { setMode('system'); }} />
    </>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    useColorSchemeSpy.mockReturnValue('light');
  });

  it('provides light theme by default when system is light', async () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('system');
    });
    expect(screen.getByTestId('isDark').props.children).toBe('false');
  });

  it('changes to dark theme when setMode is called with dark', async () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('set-dark'));
    });

    expect(screen.getByTestId('mode').props.children).toBe('dark');
    expect(screen.getByTestId('isDark').props.children).toBe('true');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('app.themeMode', 'dark');
  });

  it('persists and restores mode from AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark');

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('dark');
    });
    expect(screen.getByTestId('isDark').props.children).toBe('true');
  });

  it('resolves system mode to dark when device is in dark mode', async () => {
    useColorSchemeSpy.mockReturnValue('dark');

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('isDark').props.children).toBe('true');
    });
    expect(screen.getByTestId('mode').props.children).toBe('system');
  });
});
