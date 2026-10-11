import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';

import { initialProgressState, progressReducer } from './progress-model';
import type { Locale, ProgressStorageStatus } from './progress-model';
import { loadProgress, saveProgress } from './progress-storage';

export type { Locale } from './progress-model';

interface AppState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  completedMissionIds: readonly string[];
  completeMission: (missionId: string) => void;
  resetPracticeProgress: () => void;
  progressStorageStatus: ProgressStorageStatus;
}

const AppContext = createContext<AppState | null>(null);

// Hydration merges early user actions, queued writes keep the latest local snapshot last.
export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(progressReducer, undefined, initialProgressState);
  const writes = useRef(Promise.resolve());
  const { progress, hydrated, revision, storageStatus } = state;

  useEffect(() => {
    let active = true;
    void loadProgress().then((result) => {
      if (active) dispatch({ type: 'hydrate', ...result });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // A failed read must remain visible, never overwrite an unread record with an empty fallback.
    if (!hydrated || revision === 0) return;
    let active = true;
    writes.current = writes.current
      .then(async () => {
        await saveProgress(progress);
        if (active) dispatch({ type: 'storage', revision, unavailable: false });
      })
      .catch(() => {
        if (active) dispatch({ type: 'storage', revision, unavailable: true });
      });
    return () => {
      active = false;
    };
  }, [hydrated, progress, revision]);

  function setLocale(locale: Locale) {
    dispatch({ type: 'locale', locale });
  }

  function completeMission(missionId: string) {
    dispatch({ type: 'complete', lessonId: missionId });
  }

  function resetPracticeProgress() {
    dispatch({ type: 'reset' });
  }

  return (
    <AppContext
      value={{
        locale: progress.locale,
        setLocale,
        completedMissionIds: progress.completions[progress.locale],
        completeMission,
        resetPracticeProgress,
        progressStorageStatus: storageStatus,
      }}
    >
      {children}
    </AppContext>
  );
}

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error('useApp must be used within AppProvider');
  return state;
}
