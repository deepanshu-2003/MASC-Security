import React, { createContext, useContext } from 'react';
import { useMascAuth } from './useMascAuth';

const ThemeContext = createContext(null);

export function MascThemeProvider({ organization: propOrg, children }) {
  let auth = null;
  try {
    auth = useMascAuth();
  } catch (e) {
    // Ignore error if context is not available
  }
  const organization = propOrg || auth?.organization || null;

  return (
    <ThemeContext.Provider value={organization}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useMascTheme() {
  return useContext(ThemeContext);
}
