/**
 * Reading a log against itself.
 *
 * Everything here compares somebody with their own history and never with a
 * population, because population norms are a poor guide with structural lung
 * disease: a peak flow that would worry a GP about an asthmatic may be an
 * ordinary Tuesday, and the number that matters is the one that is unusual
 * for this person.
 *
 * Every measure that reaches back in time is anchored to an event and looks at a
 * window *before* it. That is not a stylistic choice — see the note in stats.ts
 * for why correlations over the same days would read cause and effect backwards.
 */

import { addDays, type IsoDate } from "./dates.ts";
import { carePercent, dosesDone, dosesExpected, planFor } from "./care.ts";
import { mean, median } from "./stats.ts";
import type { DayEntry, Treatment } from "./types.ts";
import type { Episode } from "./episodes.ts";

/* -------------------------------------------------------------------------- */
/*  Peak flow                                                                  */
/* -------------------------------------------------------------------------- */

export type PeakFlowZone = "green" | "amber" | "red";

export interface PeakFlowContext {
  best: number;
  percent: number;
  zone: PeakFlowZone;
  /** How many settled readings the personal best is drawn from. */
  n: number;
}

/** Readings needed before a personal best means anything. */
const PEAK_FLOW_MIN_READINGS = 5;
/** How far back a personal best is drawn from. */
const PEAK_FLOW_WINDOW_DAYS = 365;

/**
 * Peak flow read against the person's own best rather than against a predicted
 * value, which is how action plans are written. The zones are the standard
 * 80/50 split.
 *
 * Only settled days count towards the best: a best taken from a year that
 * included a bad fortnight would set the bar under where they actually live.
 */
export function peakFlowContext(
  days: Record<string, DayEntry>,
  value: number,
  today: IsoDate,
  exclude?: IsoDate,
): PeakFlowContext | { needed: number } {
  const cutoff = addDays(today, -PEAK_FLOW_WINDOW_DAYS);
  const values = Object.keys(days)
    .filter((k) => k >= cutoff && k !== exclude)
    .filter((k) => days[k]!.status === "well" && days[k]!.peakFlow !== "")
    .map((k) => Number.parseFloat(days[k]!.peakFlow))
    .filter((v) => !Number.isNaN(v));

  if (values.length < PEAK_FLOW_MIN_READINGS) {
    return { needed: PEAK_FLOW_MIN_READINGS - values.length };
  }

  const best = Math.max(...values);
  const percent = Math.round((value / best) * 100);
  const zone: PeakFlowZone = percent >= 80 ? "green" : percent >= 50 ? "amber" : "red";
  return { best, percent, zone, n: values.length };
}

export function hasPeakFlowBest(
  context: PeakFlowContext | { needed: number },
): context is PeakFlowContext {
  return !("needed" in context);
}

/* -------------------------------------------------------------------------- */
/*  Early warning                                                              */
/* -------------------------------------------------------------------------- */

export type WarningLevel = "watch" | "note";

export interface EarlyWarning {
  key: string;
  level: WarningLevel;
  text: string;
}

/** Thresholds, gathered here so they can be read and argued with in one place. */
const THRESHOLDS = {
  /** Steps on the eight point colour scale, averaged, before it is worth saying. */
  sputumColourShift: 1.3,
  sputumVolumeShift: 1.3,
  /** Percentage drop in peak flow against the preceding readings. */
  peakFlowDrop: 8,
  /** Percentage lift in resting heart rate over the settled baseline. */
  restingHrLift: 10,
  /** Percentage points of airway care lost this week against the three before. */
  careSlip: 22,
} as const;

const MAX_WARNINGS = 4;

/**
 * Rolling comparisons against the person's own recent baseline.
 *
 * Anything without enough data behind it stays silent. An app that cries wolf on
 * three entries teaches people to ignore it, and the one thing it has to get
 * right is being believed on the day it matters.
 */
export function earlyWarning(
  days: Record<string, DayEntry>,
  regimen: readonly Treatment[] | undefined,
  today: IsoDate,
): EarlyWarning[] {
  const keys = Object.keys(days)
    .filter((k) => k <= today)
    .sort()
    .reverse();

  /** The most recent `count` readings of something, optionally skipping the newest. */
  const recent = (pick: (d: DayEntry) => unknown, count: number, skip = 0): number[] => {
    const values: number[] = [];
    for (const k of keys) {
      const raw = pick(days[k]!);
      if (raw == null || raw === "" || Number.isNaN(Number(raw))) continue;
      values.push(Number(raw));
      if (values.length >= count + skip) break;
    }
    return values.length >= count + skip ? values.slice(skip, skip + count) : [];
  };

  const out: EarlyWarning[] = [];

  const colourNow = recent((d) => d.sputum.color, 3);
  const colourBefore = recent((d) => d.sputum.color, 8, 3);
  if (colourNow.length && colourBefore.length) {
    const shift = mean(colourNow)! - mean(colourBefore)!;
    if (shift >= THRESHOLDS.sputumColourShift) {
      out.push({
        key: "sputum-colour",
        level: "watch",
        text: `Sputum has been running ${shift.toFixed(1)} steps more purulent across your last three entries than the eight before them. A sustained colour shift is the earliest reliable sign of an exacerbation.`,
      });
    }
  }

  const volumeNow = recent((d) => d.sputum.volume, 3);
  const volumeBefore = recent((d) => d.sputum.volume, 8, 3);
  if (
    volumeNow.length &&
    volumeBefore.length &&
    mean(volumeNow)! - mean(volumeBefore)! >= THRESHOLDS.sputumVolumeShift
  ) {
    out.push({
      key: "sputum-volume",
      level: "watch",
      text: "Sputum volume is up against your recent baseline over the last three entries.",
    });
  }

  const peakNow = recent((d) => d.peakFlow, 3);
  const peakBefore = recent((d) => d.peakFlow, 6, 3);
  if (peakNow.length && peakBefore.length) {
    const drop = Math.round(((mean(peakBefore)! - mean(peakNow)!) / mean(peakBefore)!) * 100);
    if (drop >= THRESHOLDS.peakFlowDrop) {
      out.push({
        key: "peak-flow",
        level: "watch",
        text: `Peak flow is averaging ${drop}% lower than your previous six readings. Worth blowing again today before reading much into it, since technique drifts.`,
      });
    }
  }

  const hrNow = recent((d) => d.restHr, 3);
  const settledHr = keys
    .filter((k) => days[k]!.status === "well" && days[k]!.restHr !== "")
    .map((k) => Number(days[k]!.restHr))
    .filter((v) => !Number.isNaN(v));
  if (hrNow.length && settledHr.length >= 8) {
    const base = median(settledHr)!;
    const lift = Math.round(((mean(hrNow)! - base) / base) * 100);
    if (lift >= THRESHOLDS.restingHrLift) {
      out.push({
        key: "resting-hr",
        level: "note",
        text: `Resting heart rate is running ${lift}% above your usual ${base}. It often lifts a day or two ahead of symptoms.`,
      });
    }
  }

  const careRate = (fromDaysAgo: number, toDaysAgo: number): number | null => {
    let done = 0;
    let expected = 0;
    for (let i = fromDaysAgo; i < toDaysAgo; i++) {
      const day = days[addDays(today, -i)];
      if (!day?.status) continue;
      done += dosesDone(day, regimen);
      expected += dosesExpected(planFor(day, regimen));
    }
    // Under eight expected doses there is not enough of a fortnight logged to
    // say anything about a trend.
    return expected >= 8 ? (done / expected) * 100 : null;
  };

  const thisWeek = careRate(0, 7);
  const before = careRate(7, 28);
  if (thisWeek != null && before != null && before - thisWeek >= THRESHOLDS.careSlip) {
    out.push({
      key: "care-slip",
      level: "note",
      text: `Airway care has slipped about ${Math.round(before - thisWeek)} points this week against the three before it. Not a symptom, but it is the thing most within your control.`,
    });
  }

  return out.slice(0, MAX_WARNINGS);
}

/** A stable description of the warnings on screen, so dismissing one can expire. */
export function warningSignature(warnings: readonly EarlyWarning[]): string {
  return warnings.map((w) => w.key).sort().join("|");
}

/* -------------------------------------------------------------------------- */
/*  Lead time                                                                  */
/* -------------------------------------------------------------------------- */

export interface LeadTime {
  start: IsoDate;
  days: number;
}

/** How far back a settled baseline is drawn from before each episode. */
const BASELINE_WINDOW_DAYS = 120;
/** Settled readings needed before a baseline is worth comparing against. */
const BASELINE_MIN_READINGS = 8;
/** How far back a run-up is followed. */
const DEFAULT_LOOKBACK_DAYS = 14;

/**
 * How many days a measure had already left its own baseline before an episode
 * opened.
 *
 * Walks back from onset and stops at the first day that was back to normal, so
 * what comes out is the run leading straight into it rather than any blip in the
 * fortnight before. That number — sputum turned four days early — is the
 * difference between ringing your team and waiting another day.
 *
 * The baseline comes from settled days in the season before each episode rather
 * than from all time, so a slow drift over years does not flatten every lead
 * time to zero.
 */
export function leadTimes(
  days: Record<string, DayEntry>,
  episodes: readonly Episode[],
  pick: (day: DayEntry) => number | null,
  isWorse: (value: number, baseline: number) => boolean,
  lookback = DEFAULT_LOOKBACK_DAYS,
): LeadTime[] {
  const out: LeadTime[] = [];

  for (const episode of episodes) {
    const baselineValues: number[] = [];
    for (let i = 1; i <= BASELINE_WINDOW_DAYS; i++) {
      const day = days[addDays(episode.start, -i)];
      if (day?.status !== "well") continue;
      const value = pick(day);
      if (value != null) baselineValues.push(value);
    }
    if (baselineValues.length < BASELINE_MIN_READINGS) continue;

    const baseline = median(baselineValues)!;
    let run = 0;
    for (let i = 1; i <= lookback; i++) {
      const day = days[addDays(episode.start, -i)];
      if (!day) continue;
      const value = pick(day);
      if (value == null) continue;
      if (isWorse(value, baseline)) run = i;
      else break;
    }
    if (run > 0) out.push({ start: episode.start, days: run });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Episodes stacked at day zero                                               */
/* -------------------------------------------------------------------------- */

export interface EventLockedColumn {
  /** Days from onset. Negative is before. */
  offset: number;
  n: number;
  mean: number | null;
}

/** Columns needed, each drawn from more than one episode, before it means anything. */
const EVENT_LOCK_MIN_COLUMNS = 8;

/**
 * Every episode lined up at day zero, with each measure averaged across the days
 * either side.
 *
 * One episode is a story. Four of them stacked shows the shape a run-up actually
 * has, which is the thing no single episode can tell you. A column averaged from
 * one episode is that episode rather than a pattern, so it is dropped.
 */
export function eventLocked(
  days: Record<string, DayEntry>,
  episodes: readonly Episode[],
  pick: (day: DayEntry) => number | null,
  before = 14,
  after = 14,
): EventLockedColumn[] | null {
  const columns: { offset: number; values: number[] }[] = [];
  for (let i = -before; i <= after; i++) columns.push({ offset: i, values: [] });

  for (const episode of episodes) {
    for (let i = -before; i <= after; i++) {
      const day = days[addDays(episode.start, i)];
      if (!day) continue;
      const value = pick(day);
      if (value == null || Number.isNaN(value)) continue;
      columns[i + before]!.values.push(value);
    }
  }

  const out = columns.map((c) => ({ offset: c.offset, n: c.values.length, mean: mean(c.values) }));
  return out.filter((c) => c.n >= 2).length >= EVENT_LOCK_MIN_COLUMNS ? out : null;
}

/* -------------------------------------------------------------------------- */
/*  Timeline lanes                                                             */
/* -------------------------------------------------------------------------- */

export interface LaneSeries {
  sputum: (number | null)[];
  care: (number | null)[];
  symptoms: (number | null)[];
  peak: (number | null)[];
  aqi: (number | null)[];
}

/**
 * One value per day for each lane of the timeline, on a shared date axis so the
 * lanes cannot slide out of register with one another.
 *
 * There is no correlation figure attached to this on purpose. It shows the
 * picture and leaves the reading to the person looking at it.
 */
export function laneSeries(
  days: Record<string, DayEntry>,
  dates: readonly IsoDate[],
  regimen: readonly Treatment[] | undefined,
  bestPeakFlow: number | null,
): LaneSeries {
  return {
    sputum: dates.map((k) => days[k]?.sputum.color ?? null),
    care: dates.map((k) => carePercent(days[k], regimen)),
    symptoms: dates.map((k) => {
      const day = days[k];
      if (!day?.status) return null;
      return Object.values(day.symptoms).reduce<number>((n, v) => n + (v || 0), 0);
    }),
    peak: dates.map((k) => {
      const value = Number.parseFloat(days[k]?.peakFlow ?? "");
      if (Number.isNaN(value) || !bestPeakFlow) return null;
      return Math.round((value / bestPeakFlow) * 100);
    }),
    aqi: dates.map((k) => days[k]?.aqi?.value ?? null),
  };
}
