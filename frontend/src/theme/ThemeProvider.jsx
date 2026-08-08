import { useState, useEffect, createContext, useContext } from 'preact/compat';
import { injectAppTheme, registerAppTheme } from './adapter.js';

const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [themeType] = useState('dark');

  useEffect(() => {
    injectAppTheme();
    registerAppTheme();
  }, []);

  const theme = {
    dark: 'conflicto-dark',
    light: 'conflicto-dark',
  };

  return (
    <ThemeContext.Provider value={{ theme, themeType, setThemeType: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}
