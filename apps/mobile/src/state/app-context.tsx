import { type PropsWithChildren, createContext, useContext, useState } from 'react';

export type Locale = 'id' | 'en';

interface AppState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  completedMissionIds: readonly string[];
  completeMission: (missionId: string) => void;
}

const AppContext = createContext<AppState | null>(null);

// Keeps locale and self-reported practice completion in memory until the app restarts.
export function AppProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>('id');
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([]);

  function completeMission(missionId: string) {
    setCompletedMissionIds((ids) => (ids.includes(missionId) ? ids : [...ids, missionId]));
  }

  return (
    <AppContext value={{ locale, setLocale, completedMissionIds, completeMission }}>
      {children}
    </AppContext>
  );
}

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error('useApp must be used within AppProvider');
  return state;
}
