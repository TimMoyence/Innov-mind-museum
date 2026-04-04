import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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
      <Pressable
        testID="set-dark"
        onPress={() => {
          setMode('dark');
        }}
      />
      <Pressable
        testID="set-light"
        onPress={() => {
          setMode('light');
        }}
      />
      <Pressable
        testID="set-system"
        onPress={() => {
          setMode('system');
        }}
      />
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

    fireEvent.press(screen.getByTestId('set-dark'));

    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('dark');
    });
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

  it('ignores invalid stored mode and stays at system default', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('bogus');

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('system');
    });
  });

  it('handles AsyncStorage.getItem failure gracefully', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage fail'));

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    // Should not crash — stays at default system mode
    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('system');
    });
  });

  it('handles AsyncStorage.setItem failure gracefully', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('write fail'));

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('set-dark'));

    // Mode should still change in memory even if persistence fails
    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('dark');
    });
  });

  it('provides default noop setMode outside provider', () => {
    const Orphan = () => {
      const { setMode, mode } = useTheme();
      return (
        <>
          <Text testID="orphan-mode">{mode}</Text>
          <Pressable
            testID="orphan-set"
            onPress={() => {
              setMode('dark');
            }}
          />
        </>
      );
    };

    render(<Orphan />);
    expect(screen.getByTestId('orphan-mode').props.children).toBe('system');
    // Should not crash — noop
    fireEvent.press(screen.getByTestId('orphan-set'));
    expect(screen.getByTestId('orphan-mode').props.children).toBe('system');
  });

  it('switches from dark back to light', async () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('set-dark'));
    await waitFor(() => {
      expect(screen.getByTestId('isDark').props.children).toBe('true');
    });

    fireEvent.press(screen.getByTestId('set-light'));
    await waitFor(() => {
      expect(screen.getByTestId('isDark').props.children).toBe('false');
    });
    expect(screen.getByTestId('mode').props.children).toBe('light');
  });

  it('switches to system mode', async () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('set-dark'));
    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('dark');
    });

    fireEvent.press(screen.getByTestId('set-system'));
    await waitFor(() => {
      expect(screen.getByTestId('mode').props.children).toBe('system');
    });
  });
});
