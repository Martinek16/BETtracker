import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSettings, setSettings } from '@/data/source';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const resolve = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
};

const stored = (): Theme | null => {
  try {
    const value = localStorage.getItem('betanal:theme');
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
};

const apply = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolve(theme) === 'dark');
  // Mirrored for public/theme-boot.js, which has to know the theme before the
  // settings store - asynchronous - can be read.
  try {
    localStorage.setItem('betanal:theme', theme);
  } catch {
    /* storage can be denied; the boot script falls back to dark */
  }
};

export const ThemeProvider = ({
  children,
  defaultTheme = 'dark',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}): JSX.Element => {
  // Seeded from the same place theme-boot.js read: starting from defaultTheme
  // would repaint the page dark before the stored theme arrives.
  const [theme, setThemeState] = useState<Theme>(() => stored() ?? defaultTheme);

  useEffect(() => {
    void getSettings().then((s) => {
      setThemeState(s.theme);
      apply(s.theme);
    });
  }, []);

  useEffect(() => {
    apply(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      if (theme === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (next: Theme): void => {
    setThemeState(next);
    apply(next);
    void getSettings().then((s) => setSettings({ ...s, theme: next }));
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
