/**
 * Empty values for a day and for the whole log.
 *
 * Every field is present and explicit. A day that leaves fields out and a day
 * that records them as empty read the same to `Object.keys`, and the difference
 * matters when working out whether a question was answered or never asked.
 */

import { SEED_QUESTIONS, SEED_TAGS, TRACKABLES } from "./scales.ts";
import type { AppState, DayEntry, Question, TrackableKey } from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

export function defaultTracking(): Record<TrackableKey, boolean> {
  const out = {} as Record<TrackableKey, boolean>;
  for (const t of TRACKABLES) out[t.key] = t.defaultOn;
  return out;
}

export function emptyDay(): DayEntry {
  return {
    status: null,
    care: {},
    plan: null,
    extraSupps: "",
    sputum: { color: null, volume: null, texture: null },
    blood: null,
    bloodLook: null,
    bloodAge: null,
    symptoms: {},
    temp: "",
    spo2: "",
    peakFlow: "",
    restHr: "",
    fev1: "",
    weight: "",
    mmrc: "",
    tags: [],
    prn: {},
    courseDoses: {},
    aqi: null,
    sampleSent: false,
    organism: "",
    symptomsReviewed: undefined,
    notes: "",
  };
}

export function emptyState(): AppState {
  return {
    v: SCHEMA_VERSION,
    days: {},
    courses: [],
    tags: [...SEED_TAGS],
    prnMeds: [],
    customDrugs: [],
    customSymptoms: [],
    // No location is seeded: the air quality feature asks for one, and shipping
    // a single person's neighbourhood to everybody is both wrong and a small
    // thing to give away.
    locations: [],
    // No regimen is seeded either. A plan belongs to the person following it.
    regimen: [],
    rescue: [],
    appt: { date: "", who: "" },
    questions: SEED_QUESTIONS.map((q): Question => ({ ...q })),
    track: defaultTracking(),
    remindTimes: [],
    conditions: [],
    weightUnit: "kg",
    meta: {},
  };
}
