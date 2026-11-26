import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSavedTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const theme = window.localStorage.getItem('royal-salon-theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    return theme;
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(getSavedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('royal-salon-theme', theme);
    } catch {
      // Theme still works for this session if browser storage is unavailable.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light'),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
