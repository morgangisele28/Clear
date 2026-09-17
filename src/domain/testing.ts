/**
 * Fixture builders for tests.
 *
 * Domain tests describe a situation — three days of green sputum before an
 * episode opens — and should not be padded out with the twenty-odd fields a day
 * carries. These fill in a valid empty entry and apply whatever the test names.
 */

import { emptyDay } from "./state.ts";
import type { IsoDate } from "./dates.ts";
import type { Course, DayEntry, Treatment } from "./types.ts";

export function makeDay(patch: Partial<DayEntry> = {}): DayEntry {
  const base = emptyDay();
  return {
    ...base,
    ...patch,
    sputum: { ...base.sputum, ...(patch.sputum ?? {}) },
    symptoms: { ...base.symptoms, ...(patch.symptoms ?? {}) },
    care: { ...base.care, ...(patch.care ?? {}) },
    courseDoses: { ...base.courseDoses, ...(patch.courseDoses ?? {}) },
  };
}

/** A log keyed by date, built from a sparse description of each day. */
export function makeDays(spec: Record<string, Partial<DayEntry>>): Record<string, DayEntry> {
  const out: Record<string, DayEntry> = {};
  for (const [date, patch] of Object.entries(spec)) out[date] = makeDay(patch);
  return out;
}

export function makeCourse(patch: Partial<Course> = {}): Course {
  return {
    id: "c1",
    drug: "Ciprofloxacin",
    dose: "500 mg twice daily",
    amount: "500",
    unit: "mg",
    freq: 2,
    freqText: "",
    note: "",
    setting: "home",
    startDate: "2025-01-01" as IsoDate,
    days: 14,
    ...patch,
  };
}

export function makeTreatment(patch: Partial<Treatment> = {}): Treatment {
  return { id: "saline", name: "Saline neb", target: 1, note: "", active: true, ...patch };
}
