/**
 * The daily care plan, and how much of it actually got done.
 *
 * Two rules run through all of this and neither is obvious from the code alone:
 *
 *   1. A day is scored against the plan it was lived under. The first time a
 *      dose is ticked, that day freezes a copy of the plan. Editing the plan
 *      next year must not reach back and rewrite what a day in March was
 *      expected to do, because those figures have already been reported to a
 *      clinic.
 *   2. Course doses never count here. Ticking off an antibiotic is recorded
 *      separately, so that a two week course cannot quietly inflate airway care
 *      adherence for every day it spans, and with it every trend built on it.
 */

import { addDays, type IsoDate } from "./dates.ts";
import type { DayEntry, PlanRow, Treatment } from "./types.ts";

/** The plan as it stands today: everything switched on that asks for a dose. */
export function activePlan(regimen: readonly Treatment[] | undefined): PlanRow[] {
  return (regimen ?? [])
    .filter((t) => t.active && t.target > 0)
    .map((t) => ({ id: t.id, name: t.name, target: t.target }));
}

/** The plan a given day is scored against: its frozen copy, else the live plan. */
export function planFor(
  day: DayEntry | undefined,
  regimen: readonly Treatment[] | undefined,
): PlanRow[] {
  if (day?.plan?.length) return day.plan;
  return activePlan(regimen);
}

/** Doses a plan asks for across a day. */
export function dosesExpected(plan: readonly PlanRow[] | undefined): number {
  return (plan ?? []).reduce((n, row) => n + row.target, 0);
}

/**
 * Doses ticked off, counted against the plan. Extra doses beyond the target are
 * kept in the log but do not count here: seven sessions on one day is not the
 * same as doing the plan seven days running, and letting it read that way would
 * make the streak meaningless.
 */
export function dosesDone(
  day: DayEntry | undefined,
  regimen: readonly Treatment[] | undefined,
): number {
  if (!day?.care) return 0;
  return planFor(day, regimen).reduce(
    (n, row) => n + Math.min(day.care[row.id] ?? 0, row.target),
    0,
  );
}

/** Whether the whole plan was completed. An empty plan is never complete. */
export function careComplete(
  day: DayEntry | undefined,
  regimen: readonly Treatment[] | undefined,
): boolean {
  if (!day) return false;
  const plan = planFor(day, regimen);
  return plan.length > 0 && dosesDone(day, regimen) >= dosesExpected(plan);
}

/** Care done as a percentage of the plan, or null when there is no plan to score. */
export function carePercent(
  day: DayEntry | undefined,
  regimen: readonly Treatment[] | undefined,
): number | null {
  if (!day?.status) return null;
  const plan = planFor(day, regimen);
  const expected = dosesExpected(plan);
  if (!expected) return null;
  return (dosesDone(day, regimen) / expected) * 100;
}

export interface CareRun {
  /** Days in a row, up to today, on which the whole plan was done. */
  current: number;
  /** The longest such run on record. */
  best: number;
  /** Share of the last fortnight completed, 0 to 1, or null with no plan. */
  rate: number | null;
  hasPlan: boolean;
}

const FORTNIGHT = 14;

/**
 * The run that belongs on the daily screen.
 *
 * Days since an episode measures luck as much as effort and resets through no
 * fault of yours. This measures the thing you can still change this morning.
 *
 * Today only counts once it is finished, so the streak does not read as broken
 * at nine in the morning before anything has been done.
 */
export function careRun(
  days: Record<string, DayEntry>,
  regimen: readonly Treatment[] | undefined,
  today: IsoDate,
): CareRun {
  const plan = planFor(days[today], regimen);
  if (!plan.length) return { current: 0, best: 0, rate: null, hasPlan: false };

  let current = 0;
  let cursor = careComplete(days[today], regimen) ? today : addDays(today, -1);
  while (careComplete(days[cursor], regimen)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const logged = Object.keys(days).sort();
  let best = 0;
  let run = 0;
  for (let d = (logged[0] as IsoDate) ?? today; d <= today; d = addDays(d, 1)) {
    if (careComplete(days[d], regimen)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  let completed = 0;
  for (let i = 0; i < FORTNIGHT; i++) {
    if (careComplete(days[addDays(today, -i)], regimen)) completed++;
  }

  return { current, best, rate: completed / FORTNIGHT, hasPlan: true };
}
