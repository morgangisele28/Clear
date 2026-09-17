/**
 * Antibiotic courses: how much of one was actually taken, what moved while it
 * ran, and what the same drug has done across every course of it on record.
 *
 * Nothing here is self-reported. The response to a course is read back out of
 * the day-by-day symptom entries, because "did it work?" asked weeks later is a
 * memory test, and the answer is the one thing in the app that changes what gets
 * prescribed next time.
 */

import { addDays, diffDays, earliest, type IsoDate } from "./dates.ts";
import { median } from "./stats.ts";
import type { Course, CourseOutcome, DayEntry, Severity, SputumColour } from "./types.ts";

/** The last day of a course, or today while it is still open-ended. */
export function courseEnd(course: Course, today: IsoDate): IsoDate {
  return course.days ? addDays(course.startDate, course.days - 1) : today;
}

/** Whether a course was running at any point across a span of days. */
export function courseOverlaps(
  course: Course,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): boolean {
  const end = courseEnd(course, today);
  return !(end < from || course.startDate > to);
}

/** Whether a course was running on a given day. */
export function courseRunsOn(course: Course, date: IsoDate, today: IsoDate): boolean {
  return course.startDate <= date && courseEnd(course, today) >= date;
}

export interface CourseAdherence {
  taken: number;
  expected: number;
}

/**
 * Doses ticked off against doses expected, over the part of the course that has
 * actually happened so far.
 *
 * Null when the course has no daily frequency to count against — a tapering
 * course has no single number of doses a day, and inventing one would ask for
 * the wrong number of ticks and then score against it.
 */
export function courseAdherence(
  course: Course,
  days: Record<string, DayEntry>,
  today: IsoDate,
): CourseAdherence | null {
  const perDay = course.freq;
  if (!perDay || !course.days) return null;

  const stop = earliest(addDays(course.startDate, course.days - 1), today);
  let taken = 0;
  let expected = 0;
  for (let d = course.startDate; d <= stop; d = addDays(d, 1)) {
    expected += perDay;
    taken += Math.min(days[d]?.courseDoses?.[course.id] ?? 0, perDay);
  }
  return expected > 0 ? { taken, expected } : null;
}

/** Adherence as a percentage, or null when there is nothing to count against. */
export function adherencePercent(
  course: Course,
  days: Record<string, DayEntry>,
  today: IsoDate,
): number | null {
  const a = courseAdherence(course, days, today);
  return a ? Math.round((a.taken / a.expected) * 100) : null;
}

export interface SymptomResponse {
  key: string;
  /** Severity on the baseline day. */
  start: Severity;
  /** Severity on the last logged day of the course, or null if none. */
  end: Severity | null;
  /** Day of the course on which it first eased at all. Day 1 is the start day. */
  improvedDay: number | null;
  /** Day of the course on which it first reached none. */
  resolvedDay: number | null;
}

export interface CourseResponse {
  baselineDate: IsoDate;
  lastLoggedDate: IsoDate | null;
  symptoms: SymptomResponse[];
  sputumStart: SputumColour | null;
  sputumEnd: SputumColour | null;
  /** Days of the course that were actually logged. */
  loggedDays: number;
  /** Days of the course that have happened. */
  windowDays: number;
}

/** How far back to look for a baseline when the start day itself was not logged. */
const BASELINE_LOOKBACK_DAYS = 4;

/**
 * Reads the symptom log across a course and works out what improved, and on
 * which day.
 *
 * The baseline is the course start day if it was logged. If it was not — people
 * start antibiotics on bad days and do not always fill the app in — the most
 * recent unwell day in the few logged days before it stands in, because a
 * baseline taken from a well day would make every course look like it worked.
 */
export function courseResponse(
  course: Course,
  days: Record<string, DayEntry>,
  today: IsoDate,
): CourseResponse | null {
  const start = course.startDate;
  const end = earliest(courseEnd(course, today), today);
  const window: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) window.push(d);
  if (!window.length) return null;

  let baselineDate: IsoDate | undefined = days[start] ? start : window.find((d) => days[d]);
  if (!days[start]) {
    const before = Object.keys(days)
      .filter((k) => k < start)
      .sort();
    const from = Math.max(0, before.length - BASELINE_LOOKBACK_DAYS);
    for (let i = before.length - 1; i >= from; i--) {
      const key = before[i]!;
      if (days[key]!.status === "unwell") {
        baselineDate = key as IsoDate;
        break;
      }
    }
  }

  const baseline = baselineDate ? days[baselineDate] : undefined;
  if (!baseline || !baselineDate) return null;

  const logged = window.filter((d) => days[d]);
  const lastLoggedDate = logged.length ? logged[logged.length - 1]! : null;
  const last = lastLoggedDate ? days[lastLoggedDate] : undefined;

  const symptoms: SymptomResponse[] = Object.entries(baseline.symptoms)
    .filter(([, v]) => v > 0)
    .map(([key, startSeverity]) => {
      let improvedDay: number | null = null;
      let resolvedDay: number | null = null;

      for (const d of window) {
        const day = days[d];
        // A day whose symptom list was filled in automatically and never
        // confirmed cannot say anything eased. "Not asked" is not "absent".
        if (!day || day.symptomsReviewed === false) continue;
        const current = day.symptoms[key] ?? 0;
        if (improvedDay == null && current < startSeverity) improvedDay = diffDays(start, d) + 1;
        if (resolvedDay == null && current === 0) {
          resolvedDay = diffDays(start, d) + 1;
          break;
        }
      }

      return {
        key,
        start: startSeverity,
        end: last ? (last.symptoms[key] ?? 0) : null,
        improvedDay,
        resolvedDay,
      };
    })
    .sort((a, b) => b.start - a.start);

  return {
    baselineDate,
    lastLoggedDate,
    symptoms,
    sputumStart: baseline.sputum.color,
    sputumEnd: last ? last.sputum.color : null,
    loggedDays: logged.length,
    windowDays: window.length,
  };
}

export interface DrugCourseSummary {
  id: string;
  start: IsoDate;
  outcome: CourseOutcome | null;
  note: string;
  setting: Course["setting"];
  /** First day any symptom present at the start moved at all, read from the log. */
  easedDay: number | null;
  /** The day the person themselves said they felt better, if they were asked. */
  betterDay: number | null;
  /** First day any symptom reached none. */
  clearedDay: number | null;
  /** Percentage of expected doses actually ticked off. */
  takenPercent: number | null;
}

export interface DrugHistoryEntry {
  drug: string;
  courses: DrugCourseSummary[];
  n: number;
  easedMedian: number | null;
  easedN: number;
  feltMedian: number | null;
  takenMedian: number | null;
  tally: Record<CourseOutcome, number>;
  rated: number;
  notes: string[];
  last: IsoDate | null;
}

/**
 * Courses pooled by drug.
 *
 * One course is an anecdote. Four courses of the same drug across four episodes
 * is the closest thing to evidence a single person can hold, and it is the most
 * useful thing to put in front of whoever does the prescribing.
 *
 * Doses taken sits beside the outcome deliberately: a drug that failed on sixty
 * per cent of its doses has not really been tried.
 */
export function drugHistory(
  courses: readonly Course[] | undefined,
  days: Record<string, DayEntry>,
  today: IsoDate,
): DrugHistoryEntry[] {
  const byDrug = new Map<string, { drug: string; courses: DrugCourseSummary[] }>();

  for (const course of courses ?? []) {
    if (!course.drug) continue;
    const key = course.drug.trim().toLowerCase();
    let group = byDrug.get(key);
    if (!group) {
      group = { drug: course.drug.trim(), courses: [] };
      byDrug.set(key, group);
    }

    const response = courseResponse(course, days, today);
    const eased = (response?.symptoms ?? [])
      .map((s) => s.improvedDay)
      .filter((d): d is number => d != null);
    const cleared = (response?.symptoms ?? [])
      .map((s) => s.resolvedDay)
      .filter((d): d is number => d != null);

    group.courses.push({
      id: course.id,
      start: course.startDate,
      outcome: course.outcome ?? null,
      note: course.outcomeNote ?? "",
      setting: course.setting,
      easedDay: eased.length ? Math.min(...eased) : null,
      betterDay: course.betterDay ?? null,
      clearedDay: cleared.length ? Math.min(...cleared) : null,
      takenPercent: adherencePercent(course, days, today),
    });
  }

  return [...byDrug.values()]
    .map((group): DrugHistoryEntry => {
      const eased = group.courses.map((c) => c.easedDay).filter((d): d is number => d != null);
      const felt = group.courses.map((c) => c.betterDay).filter((d): d is number => d != null);
      const taken = group.courses.map((c) => c.takenPercent).filter((d): d is number => d != null);

      const tally: Record<CourseOutcome, number> = { resolved: 0, partial: 0, failed: 0 };
      for (const c of group.courses) if (c.outcome) tally[c.outcome]++;

      const starts = group.courses.map((c) => c.start).sort();

      return {
        drug: group.drug,
        courses: group.courses,
        n: group.courses.length,
        easedMedian: eased.length ? median(eased) : null,
        easedN: eased.length,
        feltMedian: felt.length ? median(felt) : null,
        takenMedian: taken.length ? median(taken) : null,
        tally,
        rated: tally.resolved + tally.partial + tally.failed,
        notes: group.courses.map((c) => c.note).filter(Boolean),
        last: starts.length ? starts[starts.length - 1]! : null,
      };
    })
    .sort((a, b) => b.n - a.n || (b.last ?? "") .localeCompare(a.last ?? ""));
}
