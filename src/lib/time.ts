export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** Next local midnight after `from`. */
export function nextMidnight(from: number = Date.now()): number {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** "14:30" or "2:30 PM", following the device locale. */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "4:05" for countdowns under an hour, "1 h 12 min" above. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "10 minutes", "1 hour", "90 minutes", "2 hours". */
export function minutesLabel(minutes: number): string {
  if (minutes === 60) return '1 hour';
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60} hours`;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Segment labels: "10 min", "1 hour", "2 hours". */
export function shortMinutes(minutes: number): string {
  return minutes >= 60 && minutes % 60 === 0 ? minutesLabel(minutes) : `${minutes} min`;
}

/** Time left, rounded up so the last seconds still read "1 min". */
export function minutesLeft(ms: number): string {
  return `${Math.ceil(Math.max(0, ms) / MINUTE)} min`;
}

export function durationLabel(seconds: number): string {
  if (seconds === 0) return 'No delay';
  if (seconds < 60) return `${seconds} s`;
  const min = Math.round(seconds / 60);
  return min === 1 ? '1 minute' : `${min} minutes`;
}

/** Single-letter weekday for a yyyy-MM-dd day key, in the device locale. */
export function weekdayInitial(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
}
