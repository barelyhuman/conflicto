import { useState, useEffect, createContext, useContext } from 'preact/compat';
import { registerAppTheme, resolveThemeMode } from './adapter.js';

const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [themeType, setThemeType] = useState(() => resolveThemeMode());

  useEffect(() => {
    registerAppTheme();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setThemeType(resolveThemeMode());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = {
    dark: 'conflicto-dark',
    light: 'conflicto-light',
  };

  return (
    <ThemeContext.Provider value={{ theme, themeType, setThemeType }}>
      {children}
    </ThemeContext.Provider>
  );
}
