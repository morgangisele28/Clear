/**
 * The shape of everything Clear stores.
 *
 * This file is load-bearing in a way the rest of the code is not: these types
 * describe bytes that already exist in other people's browsers, holding years
 * of entries that exist nowhere else. Changing a field here is a data migration,
 * not a refactor. See `migrate.ts` for the rules.
 */

import type { IsoDate } from "./dates.ts";

/** Bumped only alongside a migration step in `migrate.ts`. */
export const SCHEMA_VERSION = 8;

/* -------------------------------------------------------------------------- */
/*  Scales                                                                    */
/* -------------------------------------------------------------------------- */

/** Index into `SPUTUM_COLOURS`, 0 (clear) to 7 (brown/rust). */
export type SputumColour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Index into `SPUTUM_VOLUMES`, 0 (none) to 6 (copious). */
export type SputumVolume = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Index into `SPUTUM_TEXTURES`, 0 (watery) to 6 (rubbery). */
export type SputumTexture = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** How much blood came up across the day. Graded by volume, which is what decides urgency. */
export type BloodVolume = "none" | "specks" | "teaspoon" | "eggcup" | "teacup" | "more";
/** What it looked like. A separate question from how much: same volume, different meaning. */
export type BloodLook = "streaks" | "mixed" | "clots" | "frank";
export type BloodAge = "fresh" | "old";

/** Symptom severity. 0 is an explicit none, which is not the same as never answered. */
export type Severity = 0 | 1 | 2 | 3;

export type ConditionKey = "bronchiectasis" | "cf" | "copd";

/** Where a course was taken. Tablets at home and an admission are not the same event. */
export type CourseSetting = "home" | "ivhome" | "hospital";

export type CourseOutcome = "resolved" | "partial" | "failed";

export type DayStatus = "well" | "unwell";

export type TrackableKey =
  | "peakFlow"
  | "fev1"
  | "spo2"
  | "temp"
  | "restHr"
  | "weight"
  | "mmrc"
  | "aqi"
  | "culture";

export type WeightUnit = "kg" | "lb";

/* -------------------------------------------------------------------------- */
/*  Care plan                                                                 */
/* -------------------------------------------------------------------------- */

/** One treatment on the daily plan, with how many doses a day it asks for. */
export interface Treatment {
  id: string;
  name: string;
  /** Doses expected per day. */
  target: number;
  note: string;
  /**
   * Paused treatments stay on the plan but leave the day's count, so stopping a
   * steroid inhaler during a course does not read as a run of missed doses.
   */
  active: boolean;
}

/**
 * The plan a given day was scored against, frozen onto that day the first time a
 * dose is ticked. Editing the plan later must not rewrite past adherence.
 */
export interface PlanRow {
  id: string;
  name: string;
  target: number;
}

/* -------------------------------------------------------------------------- */
/*  A day                                                                     */
/* -------------------------------------------------------------------------- */

export interface SputumReading {
  color: SputumColour | null;
  volume: SputumVolume | null;
  texture: SputumTexture | null;
}

export interface AqiReading {
  value: number | null;
  pm25: number | null;
  /** Where the number came from, shown so a hand-typed one is not mistaken for a lookup. */
  source: string;
  /** The place it was read for, as the person named it. */
  location?: string;
  /** When it was fetched, as an instant. Unlike a day, this is a moment in time. */
  at?: string;
}

/**
 * Measurements are held as strings, deliberately. They come from text inputs, and
 * an empty box, "37." mid-typing and a recorded 37.0 are three different states
 * that a number field collapses into one. Parsing happens where they are read.
 */
export interface DayEntry {
  status: DayStatus | null;
  /** Doses ticked off per treatment id. */
  care: Record<string, number>;
  /** Frozen plan snapshot; null until the day is first scored. */
  plan: PlanRow[] | null;
  extraSupps: string;
  sputum: SputumReading;
  blood: BloodVolume | null;
  bloodLook: BloodLook | null;
  bloodAge: BloodAge | null;
  /** Keyed by symptom id; custom symptoms are prefixed `c:`. */
  symptoms: Record<string, Severity>;
  temp: string;
  spo2: string;
  peakFlow: string;
  restHr: string;
  fev1: string;
  weight: string;
  mmrc: string;
  tags: string[];
  /** As-needed medication taken, by name. */
  prn: Record<string, number>;
  /** Course doses ticked off, by course id. Kept apart from `care` on purpose. */
  courseDoses: Record<string, number>;
  aqi: AqiReading | null;
  sampleSent: boolean;
  organism: string;
  /**
   * Whether the symptom list has actually been answered today. `false` means the
   * zeros were filled in automatically and have not been confirmed; `undefined`
   * means the question was never put. Treating those as the same thing would let
   * "not asked" be read as "no symptoms" in the treatment response.
   */
  symptomsReviewed: boolean | undefined;
  notes: string;
}

/* -------------------------------------------------------------------------- */
/*  A course                                                                  */
/* -------------------------------------------------------------------------- */

export interface Course {
  id: string;
  drug: string;
  /**
   * The dose exactly as it was written when the course was recorded. Every reader
   * — the handover paragraph, the CSV, the course rows — prints this string, so
   * it is never rewritten by parsing; the structured fields below sit beside it.
   */
  dose: string;
  amount: string;
  unit: string;
  /** Doses per day, or 0 for anything that does not fit a daily frequency. */
  freq: number;
  freqText: string;
  note: string;
  setting: CourseSetting;
  startDate: IsoDate;
  /** Course length in days, or null while it is still open-ended. */
  days: number | null;
  outcome?: CourseOutcome;
  outcomeNote?: string;
  /** The day the person said they felt better, as opposed to what the log shows. */
  betterDay?: number;
  reviewedWith?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Everything else                                                           */
/* -------------------------------------------------------------------------- */

export interface RescueItem {
  id: string;
  name: string;
  dose: string;
  expiry: IsoDate | "";
}

export interface Location {
  name: string;
  lat: number;
  lon: number;
}

export interface Question {
  id: string;
  text: string;
  done: boolean;
}

export interface Appointment {
  date: IsoDate | "";
  who: string;
}

export interface DrugSuggestion {
  name: string;
  dose: string;
  days: number;
}

export interface AppMeta {
  seenIntro?: boolean;
  seenMilestones?: number[];
}

export interface AppState {
  v: number;
  days: Record<string, DayEntry>;
  courses: Course[];
  tags: string[];
  prnMeds: string[];
  customDrugs: DrugSuggestion[];
  customSymptoms: string[];
  locations: Location[];
  regimen: Treatment[];
  rescue: RescueItem[];
  appt: Appointment;
  questions: Question[];
  track: Record<TrackableKey, boolean>;
  /** Times of day for the care reminder calendar entries, `HH:MM`. */
  remindTimes: string[];
  conditions: ConditionKey[];
  weightUnit: WeightUnit;
  meta: AppMeta;
  /** The exact set of early warnings that was on screen when it was dismissed. */
  ewSeen?: string;
  folds?: Record<string, boolean>;
  noted?: Record<string, string>;
}
