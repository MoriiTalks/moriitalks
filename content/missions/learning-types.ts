// Shared content shape, completion is a practice record rather than an assessed skill score.
export type LearningLocale = 'id' | 'en';
export type StageId =
  'clear-idea' | 'clear-explanation' | 'listener-awareness' | 'presentation-practice';
export type LessonId = `${StageId}-${1 | 2 | 3 | 4}`;

export interface ChoiceExercise {
  kind: 'choice';
  question: string;
  options: readonly [string, string, string];
  correctOption: 0 | 1 | 2;
  success: string;
  hint: string;
}

export interface SequenceExercise {
  kind: 'sequence';
  question: string;
  // Content lists the intended order, the interface presents a shuffled set of cards.
  items: readonly [string, string, string] | readonly [string, string, string, string];
  success: string;
  hint: string;
}

export type LessonExercise = ChoiceExercise | SequenceExercise | { kind: 'speak' };

export interface SpeakingPractice {
  prompt: string;
  starter: string;
  selfCheck: string;
}

export interface LessonCopy {
  title: string;
  goal: string;
  example: string;
  exampleNote: string;
  exercise: LessonExercise;
  // Two spoken attempts use different contexts, recognition never replaces speaking practice.
  practices: readonly [SpeakingPractice, SpeakingPractice];
  retry: string;
  transfer: string;
}

export interface LearningLesson {
  id: LessonId;
  baseline?: boolean;
  locales: Record<LearningLocale, LessonCopy>;
}

export interface LearningStage {
  id: StageId;
  locales: Record<LearningLocale, { title: string; goal: string }>;
  lessons: readonly [LearningLesson, LearningLesson, LearningLesson, LearningLesson];
}
