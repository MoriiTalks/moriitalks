// Stores bounded civil dates, exact completion timestamps remain ephemeral.
const fallbackTimeZone = 'Asia/Jakarta';
const retainedDays = 14;
const civilDayMilliseconds = 86_400_000;

export interface PracticeMoment {
  at: number;
  timeZone: string;
}

export interface PracticeActivity {
  timeZone: string;
  days: readonly string[];
  streakStart: string;
}

export interface PracticeDay {
  date: string;
  completed: boolean;
  today: boolean;
}

export interface PracticeSummary {
  today: string;
  week: readonly PracticeDay[];
  weeklyDays: number;
  streak: number;
  practicedToday: boolean;
  clockChanged: boolean;
}

export function deviceTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimeZone(timeZone) ? timeZone : fallbackTimeZone;
  } catch {
    return fallbackTimeZone;
  }
}

function validTimeZone(timeZone: string): boolean {
  if (timeZone.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function civilDay(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const year = Number(date.slice(0, 4));
  if (year < 1) return undefined;
  const value = new Date(0);
  value.setUTCFullYear(year, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  value.setUTCHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10) === date
    ? value.getTime() / civilDayMilliseconds
    : undefined;
}

function dateFromDay(day: number): string {
  const value = new Date(day * civilDayMilliseconds);
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const date = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function practiceDate(at: number, timeZone: string): string | undefined {
  if (!Number.isFinite(at) || !validTimeZone(timeZone)) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
    }).formatToParts(at);
    const year = parts.find((part) => part.type === 'year')?.value.padStart(4, '0');
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    const era = parts.find((part) => part.type === 'era')?.value;
    if (!year || !month || !day || era !== 'AD') return undefined;
    const date = `${year}-${month}-${day}`;
    return civilDay(date) !== undefined ? date : undefined;
  } catch {
    return undefined;
  }
}

export function recordPractice(
  activity: PracticeActivity | undefined,
  moment: PracticeMoment,
): PracticeActivity | undefined {
  const timeZone = activity?.timeZone ?? moment.timeZone;
  const date = practiceDate(moment.at, timeZone);
  if (!date) return activity;
  const latest = activity?.days.at(-1);
  if (latest && date <= latest) return activity;
  const day = civilDay(date);
  const latestDay = latest ? civilDay(latest) : undefined;
  const consecutive = day !== undefined && latestDay !== undefined && day === latestDay + 1;
  return {
    timeZone,
    days: [...(activity?.days ?? []), date].slice(-retainedDays),
    streakStart: consecutive && activity ? activity.streakStart : date,
  };
}

export function decodePracticeActivity(value: unknown): PracticeActivity | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      (key) => key !== 'timeZone' && key !== 'days' && key !== 'streakStart',
    ) ||
    !('timeZone' in value) ||
    typeof value.timeZone !== 'string' ||
    !validTimeZone(value.timeZone) ||
    !('streakStart' in value) ||
    typeof value.streakStart !== 'string' ||
    !('days' in value) ||
    !Array.isArray(value.days) ||
    value.days.length < 1 ||
    value.days.length > retainedDays
  )
    return undefined;

  const days: string[] = [];
  const ordinals: number[] = [];
  for (const candidate of value.days) {
    if (typeof candidate !== 'string') return undefined;
    const ordinal = civilDay(candidate);
    const previous = ordinals.at(-1);
    if (ordinal === undefined || (previous !== undefined && ordinal <= previous)) return undefined;
    days.push(candidate);
    ordinals.push(ordinal);
  }
  const start = civilDay(value.streakStart);
  const latest = ordinals.at(-1);
  const earliest = ordinals[0];
  if (start === undefined || latest === undefined || earliest === undefined || start > latest) {
    return undefined;
  }
  const startIndex = ordinals.indexOf(start);
  if (startIndex < 0 && (start >= earliest || days.length !== retainedDays)) return undefined;

  const suffixIndex = Math.max(0, startIndex);
  const preceding = ordinals[suffixIndex - 1];
  if (preceding !== undefined && preceding === start - 1) return undefined;
  for (let index = suffixIndex + 1; index < ordinals.length; index += 1) {
    const current = ordinals[index];
    const previous = ordinals[index - 1];
    if (current === undefined || previous === undefined || current !== previous + 1) {
      return undefined;
    }
  }
  return { timeZone: value.timeZone, days, streakStart: value.streakStart };
}

export function summarizePractice(
  activity: PracticeActivity | undefined,
  at: number,
  timeZone: string,
): PracticeSummary {
  const zone = activity?.timeZone ?? (validTimeZone(timeZone) ? timeZone : fallbackTimeZone);
  const today = practiceDate(at, zone) ?? practiceDate(0, zone) ?? '1970-01-01';
  const todayDay = civilDay(today) ?? 0;
  // UTC is used only to index civil dates, elapsed device hours never define adjacency.
  const weekday = new Date(todayDay * civilDayMilliseconds).getUTCDay();
  const monday = todayDay - ((weekday + 6) % 7);
  const days = activity?.days ?? [];
  const week = Array.from({ length: 7 }, (_, index): PracticeDay => {
    const date = dateFromDay(monday + index);
    return { date, completed: date <= today && days.includes(date), today: date === today };
  });
  const latest = days.at(-1);
  const latestDay = latest ? civilDay(latest) : undefined;
  const startDay = activity ? civilDay(activity.streakStart) : undefined;
  const clockChanged = latest !== undefined && latest > today;
  const ongoing = latestDay !== undefined && (latestDay === todayDay || latestDay === todayDay - 1);
  return {
    today,
    week,
    weeklyDays: week.filter((day) => day.completed).length,
    streak: !clockChanged && ongoing && startDay !== undefined ? latestDay - startDay + 1 : 0,
    practicedToday: days.includes(today),
    clockChanged,
  };
}
