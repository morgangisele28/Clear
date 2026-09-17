/**
 * Dates in Clear are calendar days, never instants.
 *
 * A day in a health log is the one the person lived through in their own
 * timezone: an entry made at 11pm belongs to that evening, not to the following
 * morning in UTC. So every date in stored state is a local `YYYY-MM-DD` string
 * and arithmetic goes through these helpers rather than through Date directly.
 *
 * Nothing here reads the clock. `today` is passed in by the caller, which is
 * what makes every derivation built on top of this module testable without
 * mocking time — the single biggest reason the old code could not be tested.
 */

/** A calendar day in local time, `YYYY-MM-DD`. */
export type IsoDate = string & { readonly __isoDate?: unique symbol };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && DATE_RE.test(value);
}

/** The local calendar day of a Date, as `YYYY-MM-DD`. */
export function toIso(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` as IsoDate;
}

/** Local midnight on the given calendar day. */
export function fromIso(s: IsoDate): Date {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Reads the clock. The only function in the domain layer that does, and it is
 * called at the edges — never inside a derivation, which takes `today` instead.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now);
}

/**
 * Calendar days added, not 24-hour periods. Going through the local Date
 * constructor means a day that is 23 or 25 hours long across a daylight saving
 * boundary still counts as exactly one day, which is what a diary means by it.
 */
export function addDays(s: IsoDate, n: number): IsoDate {
  const d = fromIso(s);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Whole calendar days from `a` to `b`. Negative when `b` is earlier. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const ms = fromIso(b).getTime() - fromIso(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every day from `from` to `to` inclusive. Empty when `to` precedes `from`. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isBefore = (a: IsoDate, b: IsoDate): boolean => a < b;
export const isAfter = (a: IsoDate, b: IsoDate): boolean => a > b;

/** Clamps a date into a range, used to stop a course counting past today. */
export function earliest(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function latest(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}
