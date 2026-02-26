/**
 * @module ThemeContext
 * @description Contexto de tema (claro/escuro) do FintechFlow.
 *
 * Persiste a preferência no `localStorage` com chave `fintechflow_theme`.
 * Adiciona/remove a classe `dark` no elemento `<html>` para ativar
 * as variáveis CSS definidas em `theme.css`.
 *
 * @exports ThemeProvider — componente wrapper
 * @exports useTheme — hook que retorna `{ theme, toggleTheme }`
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('fintechflow_theme') as Theme | null;
    if (saved) return saved;
    // Respeitar preferência do SO
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('fintechflow_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
