import { useContext } from 'react';
import { AppContext } from '../context/AppContextBase';
import type { AppContextValue } from '../context/AppContextBase';

/**
 * Hook to access the App context.
 * Must be used within an AppProvider.
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
