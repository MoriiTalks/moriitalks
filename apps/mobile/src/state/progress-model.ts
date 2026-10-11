// Stores only language and self-reported completion, never recordings, transcripts, or skill scores.
import {
  findLesson,
  learningLessons,
} from '../../../../content/missions/presentation-foundations.ts';
import type { LearningLocale } from '../../../../content/missions/presentation-foundations.ts';

export type Locale = LearningLocale;
export type ProgressStorageStatus = 'loading' | 'saving' | 'loaded' | 'unavailable';

export interface SavedProgress {
  version: 1;
  locale: Locale;
  completions: Record<Locale, readonly string[]>;
}

export interface ProgressState {
  progress: SavedProgress;
  hydrated: boolean;
  revision: number;
  localeChanged: boolean;
  progressReset: boolean;
  storageStatus: ProgressStorageStatus;
}

export type ProgressAction =
  | { type: 'locale'; locale: Locale }
  | { type: 'complete'; lessonId: string }
  | { type: 'reset' }
  | { type: 'hydrate'; saved: SavedProgress | undefined; unavailable: boolean }
  | { type: 'storage'; revision: number; unavailable: boolean };

export function emptyProgress(): SavedProgress {
  return { version: 1, locale: 'id', completions: { id: [], en: [] } };
}

export function initialProgressState(): ProgressState {
  return {
    progress: emptyProgress(),
    hydrated: false,
    revision: 0,
    localeChanged: false,
    progressReset: false,
    storageStatus: 'loading',
  };
}

export function canStartLesson(lessonId: string, completedIds: readonly string[]): boolean {
  const index = learningLessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return false;
  return learningLessons.slice(0, index).every((lesson) => completedIds.includes(lesson.id));
}

export function nextLesson(completedIds: readonly string[]) {
  return learningLessons.find(
    (lesson) => !completedIds.includes(lesson.id) && canStartLesson(lesson.id, completedIds),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function knownCompletions(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > learningLessons.length + 1) return undefined;
  const items: readonly unknown[] = value;
  if (items.some((item) => typeof item !== 'string')) return undefined;
  const ids = items.filter(
    (item): item is string =>
      typeof item === 'string' && (item === 'first-explanation' || findLesson(item) !== undefined),
  );
  // Discard impossible gaps rather than unlocking later lessons from an untrusted storage value.
  return [...new Set(ids)].filter((id) => id === 'first-explanation' || canStartLesson(id, ids));
}

export function decodeProgress(raw: string | null): SavedProgress | undefined {
  if (raw === null || raw.length > 8192) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value['version'] !== 1 ||
      (value['locale'] !== 'id' && value['locale'] !== 'en') ||
      !isRecord(value['completions'])
    ) {
      return undefined;
    }
    const id = knownCompletions(value['completions']['id']);
    const en = knownCompletions(value['completions']['en']);
    if (id === undefined || en === undefined) return undefined;
    return { version: 1, locale: value['locale'], completions: { id, en } };
  } catch {
    return undefined;
  }
}

export function progressReducer(state: ProgressState, action: ProgressAction): ProgressState {
  switch (action.type) {
    case 'locale':
      return {
        ...state,
        progress: { ...state.progress, locale: action.locale },
        localeChanged: true,
        revision: state.revision + 1,
        storageStatus: state.hydrated ? 'saving' : state.storageStatus,
      };
    case 'complete': {
      const { locale, completions } = state.progress;
      const ids = completions[locale];
      if (
        ids.includes(action.lessonId) ||
        (action.lessonId !== 'first-explanation' && !canStartLesson(action.lessonId, ids))
      ) {
        return state;
      }
      return {
        ...state,
        revision: state.revision + 1,
        storageStatus: state.hydrated ? 'saving' : state.storageStatus,
        progress: {
          ...state.progress,
          completions: { ...completions, [locale]: [...ids, action.lessonId] },
        },
      };
    }
    case 'reset':
      return {
        ...state,
        progress: { ...state.progress, completions: { id: [], en: [] } },
        progressReset: true,
        revision: state.revision + 1,
        storageStatus: state.hydrated ? 'saving' : state.storageStatus,
      };
    case 'hydrate': {
      if (state.hydrated) return state;
      const saved = action.saved ?? emptyProgress();
      return {
        ...state,
        hydrated: true,
        storageStatus:
          state.revision > 0 ? 'saving' : action.unavailable ? 'unavailable' : 'loaded',
        progress: {
          version: 1,
          locale: state.localeChanged ? state.progress.locale : saved.locale,
          completions: state.progressReset
            ? state.progress.completions
            : {
                id: [...new Set([...saved.completions.id, ...state.progress.completions.id])],
                en: [...new Set([...saved.completions.en, ...state.progress.completions.en])],
              },
        },
      };
    }
    case 'storage': {
      if (action.revision !== state.revision) return state;
      const storageStatus = action.unavailable ? 'unavailable' : 'loaded';
      return state.storageStatus === storageStatus ? state : { ...state, storageStatus };
    }
  }
}
