/**
 * Turning dates and lists into the words a report is written in.
 *
 * These format explicitly rather than through `toLocaleDateString`. A handover
 * paragraph is pasted into a message to a respiratory team and read by someone
 * else, so "04/03" meaning the fourth of March or the third of April is not an
 * ambiguity worth inheriting from whatever locale the phone happens to be set
 * to. Spelling the month out removes the question, and it makes the generated
 * text stable enough to hold under test.
 */

import { fromIso, type IsoDate } from "./dates.ts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const parts = (s: IsoDate) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};

/** "4 March" */
export function formatDay(s: IsoDate): string {
  const { m, d } = parts(s);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "4 Mar" */
export function formatShort(s: IsoDate): string {
  const { m, d } = parts(s);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "4 Mar 25" */
export function formatShortYear(s: IsoDate): string {
  const { y, m, d } = parts(s);
  return `${d} ${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** "Tuesday, 4 March" */
export function formatLong(s: IsoDate): string {
  const { m, d } = parts(s);
  return `${WEEKDAYS[fromIso(s).getDay()]}, ${d} ${MONTHS[m - 1]}`;
}

/** "Tue 4 Mar" */
export function formatWeekday(s: IsoDate): string {
  const { m, d } = parts(s);
  return `${WEEKDAYS_SHORT[fromIso(s).getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "a, b and c" — an Oxford-comma-free list, the way it would be said aloud. */
export function listOf(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "1 day" / "3 days" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
