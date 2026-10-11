import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { decodeProgress } from './progress-model';
import type { SavedProgress } from './progress-model';

const storageKey = 'moriitalks.practice.v1';

// A small local record keeps progress and practice dates offline, nothing is uploaded.
export async function loadProgress(): Promise<{
  saved: SavedProgress | undefined;
  unavailable: boolean;
}> {
  try {
    let raw: string | null;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return { saved: undefined, unavailable: false };
      raw = window.localStorage.getItem(storageKey);
    } else {
      const file = new File(Paths.document, `${storageKey}.json`);
      if (!file.exists) return { saved: undefined, unavailable: false };
      if (file.size > 8192) return { saved: undefined, unavailable: true };
      raw = await file.text();
    }
    const saved = decodeProgress(raw);
    return { saved, unavailable: raw !== null && saved === undefined };
  } catch {
    return { saved: undefined, unavailable: true };
  }
}

export async function saveProgress(progress: SavedProgress): Promise<void> {
  const raw = JSON.stringify(progress);
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, raw);
    return;
  }
  const file = new File(Paths.document, `${storageKey}.json`);
  const temporary = new File(Paths.document, `${storageKey}.tmp`);
  // Prepare the next small record before replacing the saved file, AppProvider serializes writes.
  if (!temporary.exists) temporary.create();
  temporary.write(raw);
  await temporary.move(file, { overwrite: true });
}
