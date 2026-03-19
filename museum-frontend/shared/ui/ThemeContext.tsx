import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, type ThemePalette } from './themes';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePalette;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const THEME_KEY = 'app.themeMode';

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'system',
  isDark: false,
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode).catch(() => {});
  }, []);

  const isDark =
    mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
