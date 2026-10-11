import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { deviceTimeZone, summarizePractice } from '@/state/practice-activity';
import type { PracticeActivity } from '@/state/practice-activity';

// Refresh civil dates while the journal is visible, stop polling off-screen or in the background.
export function usePracticeSummary(activity: PracticeActivity | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | undefined;

      function stopTimer() {
        clearInterval(timer);
        timer = undefined;
      }

      function refresh() {
        setNow(Date.now());
      }

      function updateVisibility(state: string) {
        stopTimer();
        if (state !== 'active') return;
        refresh();
        timer = setInterval(refresh, 60_000);
      }

      updateVisibility(AppState.currentState);
      const listener = AppState.addEventListener('change', updateVisibility);
      return () => {
        stopTimer();
        listener.remove();
      };
    }, []),
  );

  return summarizePractice(activity, now, deviceTimeZone());
}
