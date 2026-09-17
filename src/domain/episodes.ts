/**
 * Episodes: runs of being unwell, formed from the log rather than declared.
 *
 * Nobody opens an app to announce that an exacerbation has begun. They mark a
 * day unwell because it was. An episode is therefore derived — a run of unwell
 * days, closed by a clear week — which means a day marked unwell in hindsight
 * joins the right episode automatically, and no episode can be left hanging open
 * because somebody forgot to close it.
 */

import { addDays, datesBetween, diffDays, type IsoDate } from "./dates.ts";
import { courseOverlaps } from "./courses.ts";
import { median } from "./stats.ts";
import type { Course, DayEntry, SputumColour } from "./types.ts";

/**
 * Days with no unwell entry that close an episode.
 *
 * A week is long enough that a couple of better days in the middle of a bad
 * fortnight do not split one illness into two, and short enough that two
 * genuinely separate infections a month apart are not merged into one.
 */
export const EPISODE_GAP_DAYS = 7;

export interface Episode {
  /** The start date, which also serves as a stable identifier. */
  id: IsoDate;
  /** Position in the log, oldest first, counting from 1. */
  index: number;
  start: IsoDate;
  end: IsoDate;
  /** Calendar days from start to end inclusive. */
  span: number;
  /** How many of those days were actually marked unwell. */
  loggedDays: number;
  dates: IsoDate[];
  peakColour: SputumColour | null;
  hadBlood: boolean;
  minPeakFlow: number | null;
  maxTemp: number | null;
  /** Courses that were running at any point during the episode. */
  courses: Course[];
  tags: string[];
  organisms: string[];
  meanAqi: number | null;
}

/**
 * Groups unwell days into episodes and summarises each one.
 *
 * Note that the span is calendar days from start to end, while `loggedDays`
 * counts the days actually marked. They differ whenever somebody was too ill to
 * fill the app in, and reporting the span as though every day of it were
 * recorded would overstate what the log can support.
 */
export function buildEpisodes(
  days: Record<string, DayEntry>,
  courses: readonly Course[] | undefined,
  today: IsoDate,
): Episode[] {
  const unwell = Object.keys(days)
    .filter((k) => days[k]!.status === "unwell")
    .sort() as IsoDate[];

  const runs: { start: IsoDate; end: IsoDate; dates: IsoDate[] }[] = [];
  let current: { start: IsoDate; end: IsoDate; dates: IsoDate[] } | null = null;

  for (const date of unwell) {
    if (!current) {
      current = { start: date, end: date, dates: [date] };
    } else if (diffDays(current.end, date) <= EPISODE_GAP_DAYS) {
      current.end = date;
      current.dates.push(date);
    } else {
      runs.push(current);
      current = { start: date, end: date, dates: [date] };
    }
  }
  if (current) runs.push(current);

  return runs.map((run, i) => {
    let peakColour: SputumColour | null = null;
    let hadBlood = false;
    let maxTemp: number | null = null;
    const peakFlows: number[] = [];
    const aqis: number[] = [];
    const tags = new Set<string>();
    const organisms = new Set<string>();

    for (const date of run.dates) {
      const day = days[date]!;
      if (day.sputum.color != null) {
        peakColour = Math.max(peakColour ?? 0, day.sputum.color) as SputumColour;
      }
      if (day.blood && day.blood !== "none") hadBlood = true;

      const pf = Number.parseFloat(day.peakFlow);
      if (!Number.isNaN(pf)) peakFlows.push(pf);

      const temp = Number.parseFloat(day.temp);
      if (!Number.isNaN(temp)) maxTemp = Math.max(maxTemp ?? 0, temp);

      for (const tag of day.tags) tags.add(tag);
      if (day.organism) organisms.add(day.organism);
      if (day.aqi?.value != null) aqis.push(day.aqi.value);
    }

    const overlapping = (courses ?? []).filter((c) =>
      courseOverlaps(c, run.start, run.end, today),
    );

    return {
      id: run.start,
      index: i + 1,
      start: run.start,
      end: run.end,
      span: diffDays(run.start, run.end) + 1,
      loggedDays: run.dates.length,
      dates: run.dates,
      peakColour,
      hadBlood,
      minPeakFlow: peakFlows.length ? Math.min(...peakFlows) : null,
      maxTemp,
      courses: overlapping,
      tags: [...tags],
      organisms: [...organisms],
      meanAqi: aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null,
    };
  });
}

/** Every calendar day an episode covers, including any that were not logged. */
export function episodeDates(episode: Episode): IsoDate[] {
  return datesBetween(episode.start, episode.end);
}

/** Clear days between one episode ending and the next beginning. */
export function gapsBetween(episodes: readonly Episode[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < episodes.length; i++) {
    gaps.push(diffDays(episodes[i - 1]!.end, episodes[i]!.start));
  }
  return gaps;
}

export interface WellRun {
  /** Days since the last episode ended. */
  current: number;
  /** The longest gap between episodes on record. */
  best: number;
  /** What the current run is measured against. */
  target: number;
  /** How close the current run is to the target, 0 to 1. */
  clarity: number;
  noHistory: boolean;
  isBest: boolean;
}

/** The shortest run worth aiming at before there is any history to beat. */
const STARTING_TARGET = 30;
/** What an empty log shows, so a new user does not open to a fully clouded sky. */
const NO_HISTORY_CLARITY = 0.55;

/**
 * What the app is actually for: longer clear runs, fewer of them interrupted.
 */
export function wellRun(
  days: Record<string, DayEntry>,
  episodes: readonly Episode[],
  today: IsoDate,
): WellRun {
  const todayStatus = days[today]?.status ?? null;
  const last = episodes.length ? episodes[episodes.length - 1]! : null;
  const logged = Object.keys(days).sort() as IsoDate[];

  let current = 0;
  if (todayStatus === "unwell") current = 0;
  else if (last) current = diffDays(last.end, today);
  else if (logged.length) current = diffDays(logged[0]!, today) + 1;

  const gaps = gapsBetween(episodes);
  const best = gaps.length ? Math.max(...gaps) : 0;
  const target = Math.max(best, STARTING_TARGET);
  const noHistory = logged.length === 0;

  return {
    current,
    best,
    target,
    clarity: noHistory ? NO_HISTORY_CLARITY : Math.min(current / target, 1),
    noHistory,
    isBest: best > 0 && current > best,
  };
}

export interface RecoveryTrend {
  points: { start: IsoDate; span: number }[];
  /** Median episode length across the earlier half. */
  early: number | null;
  /** Median episode length across the later half. */
  late: number | null;
  n: number;
}

/**
 * Whether recovery is getting quicker or slower.
 *
 * Duration alone only says how long somebody was marked unwell. Splitting the
 * record in half lets a direction be read off rather than inferred from a list
 * of dates. Under three episodes there is no trend to speak of, so it says so.
 */
export function recoveryTrend(episodes: readonly Episode[]): RecoveryTrend | null {
  if (episodes.length < 3) return null;
  const points = episodes.map((e) => ({ start: e.start, span: e.span }));
  const half = Math.floor(points.length / 2);
  return {
    points,
    early: median(points.slice(0, half).map((p) => p.span)),
    late: median(points.slice(-half).map((p) => p.span)),
    n: points.length,
  };
}

export interface Seasonality {
  /** Episode counts by calendar month, January first. */
  byMonth: number[];
  /** How many distinct years the counts are pooled across. */
  years: number;
  total: number;
}

/**
 * Episodes by calendar month, pooled across every year on record.
 *
 * Small numbers, so it is a count rather than a rate, and it carries the number
 * of years it spans: three Januaries out of three years means something quite
 * different from three out of nine.
 */
export function seasonality(episodes: readonly Episode[]): Seasonality {
  const byMonth = new Array<number>(12).fill(0);
  const years = new Set<number>();
  for (const e of episodes) {
    const [y, m] = e.start.split("-").map(Number) as [number, number];
    byMonth[m - 1]!++;
    years.add(y);
  }
  return { byMonth, years: years.size, total: episodes.length };
}

/** Episodes that started in a given calendar year. */
export function episodesInYear(episodes: readonly Episode[], year: number): Episode[] {
  return episodes.filter((e) => e.start.startsWith(String(year)));
}

/** Whether an episode is still running, allowing for today not being logged yet. */
export function isOngoing(episode: Episode, today: IsoDate): boolean {
  return episode.end >= addDays(today, -1);
}
