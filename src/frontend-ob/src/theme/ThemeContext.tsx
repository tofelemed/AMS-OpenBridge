import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { applyTheme, readTheme, type Theme } from './theme';

interface ThemeValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeValue>({ theme: 'day', setTheme: () => undefined });

export const useTheme = (): ThemeValue => useContext(ThemeContext);

/** Holds the theme for the React tree. The blocking script in index.html has already applied it. */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setState] = useState<Theme>(readTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
