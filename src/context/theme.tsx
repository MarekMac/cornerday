import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { THEME_PREF_KEY } from '@/constants/storage-keys';
import { AppColors, Colors } from '@/constants/theme';

export type ThemePref = 'system' | 'light' | 'dark';
type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  colorScheme: ColorScheme;
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: 'light',
  themePref: 'light',
  setThemePref: () => {},
  colors: Colors.light,
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = (useSystemColorScheme() ?? 'light') as ColorScheme;
  const [themePref, setThemePrefState] = useState<ThemePref>('light');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREF_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemePrefState(val);
      }
      setLoaded(true);
    });
  }, []);

  const setThemePref = useCallback((pref: ThemePref) => {
    setThemePrefState(pref);
    AsyncStorage.setItem(THEME_PREF_KEY, pref);
  }, []);

  const colorScheme: ColorScheme = themePref === 'system' ? systemScheme : themePref;

  const value = useMemo<ThemeContextType>(
    () => ({ colorScheme, themePref, setThemePref, colors: Colors[colorScheme] }),
    [colorScheme, themePref, setThemePref],
  );

  // Don't render until we've read the stored pref, to avoid a flash
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);
