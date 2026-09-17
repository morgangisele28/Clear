/**
 * Every change that can be made to the log, in one place.
 *
 * The old app spread this across eighty-odd pieces of component state, which
 * meant the rules about how a day changes — what carries forward, what must not
 * be overwritten, what a course dose must never touch — lived inside whichever
 * button happened to implement them. Gathering them into one pure function makes
 * those rules readable, and testable without rendering anything.
 *
 * The reducer never reads the clock. Actions that need to know what day it is
 * carry it, which is also what makes them replayable in a test.
 */

import { diffDays, type IsoDate } from "@/domain/dates.ts";
import { activePlan } from "@/domain/care.ts";
import { emptyDay, emptyState } from "@/domain/state.ts";
import { SYMPTOMS, CUSTOM_SYMPTOM_PREFIX } from "@/domain/scales.ts";
import type {
  Appointment,
  AppState,
  ConditionKey,
  Course,
  CourseOutcome,
  DayEntry,
  DayStatus,
  DrugSuggestion,
  Location,
  Question,
  RescueItem,
  Severity,
  TrackableKey,
  Treatment,
  WeightUnit,
} from "@/domain/types.ts";
import type { AqiReading } from "@/domain/types.ts";

export interface CourseReviewRow {
  id: string;
  outcome: CourseOutcome;
  betterDay?: number;
  outcomeNote?: string;
  reviewedWith?: string[];
}

export type Action =
  /* A day */
  | { type: "day/patch"; date: IsoDate; patch: Partial<DayEntry> }
  | { type: "day/setStatus"; date: IsoDate; status: DayStatus | null; customSymptoms?: string[] }
  | { type: "day/markWell"; date: IsoDate }
  | { type: "day/clear"; date: IsoDate }
  | { type: "day/setCare"; date: IsoDate; treatmentId: string; count: number; regimen: Treatment[] }
  | { type: "day/setSymptom"; date: IsoDate; key: string; severity: Severity }
  | { type: "day/toggleTag"; date: IsoDate; tag: string }
  | { type: "day/setPrn"; date: IsoDate; name: string; count: number }
  | { type: "day/setAqi"; date: IsoDate; aqi: AqiReading | null }
  /* Courses */
  | { type: "course/add"; course: Course }
  | { type: "course/edit"; id: string; patch: Partial<Course> }
  | { type: "course/delete"; id: string }
  | { type: "course/endOn"; id: string; date: IsoDate }
  | { type: "course/setDose"; date: IsoDate; id: string; count: number }
  | { type: "course/review"; rows: CourseReviewRow[] }
  /* The plan and what gets tracked */
  | { type: "regimen/set"; regimen: Treatment[]; today: IsoDate }
  | { type: "tracking/set"; track: Record<TrackableKey, boolean> }
  | { type: "conditions/set"; conditions: ConditionKey[] }
  | { type: "weightUnit/set"; unit: WeightUnit }
  | { type: "reminders/set"; times: string[] }
  /* Lists the person builds up */
  | { type: "tags/add"; tag: string }
  | { type: "tags/delete"; tag: string }
  | { type: "prnMeds/add"; name: string }
  | { type: "prnMeds/delete"; name: string }
  | { type: "customDrugs/add"; drug: DrugSuggestion }
  | { type: "customDrugs/delete"; name: string }
  | { type: "customSymptoms/add"; name: string }
  | { type: "customSymptoms/delete"; name: string }
  | { type: "locations/add"; location: Location }
  /* Everything else */
  | { type: "rescue/set"; items: RescueItem[] }
  | { type: "appointment/set"; appointment: Appointment }
  | { type: "questions/set"; questions: Question[] }
  | { type: "meta/seenIntro" }
  | { type: "meta/seenMilestone"; milestone: number }
  | { type: "warnings/dismiss"; signature: string }
  | { type: "ui/setFold"; id: string; open: boolean }
  | { type: "ui/note"; id: string; signature: string }
  /* Wholesale */
  | { type: "log/replace"; state: AppState }
  | { type: "log/wipe" };

/** How many recently kept locations to remember. */
const LOCATIONS_KEPT = 12;

/** Reads a day out of the log, filled in, without writing it back. */
function dayAt(state: AppState, date: IsoDate): DayEntry {
  return { ...emptyDay(), ...state.days[date] };
}

function withDay(state: AppState, date: IsoDate, day: DayEntry): AppState {
  return { ...state, days: { ...state.days, [date]: day } };
}

/** The most recent logged day before `date`, if there is one. */
function lastLoggedBefore(
  state: AppState,
  date: IsoDate,
  where: (day: DayEntry) => boolean = () => true,
): DayEntry | null {
  const keys = Object.keys(state.days)
    .filter((k) => k < date && where(state.days[k]!))
    .sort();
  return keys.length ? state.days[keys[keys.length - 1]!]! : null;
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "day/patch":
      return withDay(state, action.date, { ...dayAt(state, action.date), ...action.patch });

    case "day/setStatus": {
      const previous = dayAt(state, action.date);
      const next: DayEntry = { ...previous, status: action.status };

      // Opening a day with the last reading carried forward beats opening it
      // blank: most days are much like the one before, and a blank sputum panel
      // asks somebody to re-describe something that has not changed.
      if (action.status && next.sputum.color == null) {
        const last = lastLoggedBefore(state, action.date, (d) => d.sputum.color != null);
        if (last) next.sputum = { ...last.sputum };
      }
      if (action.status && !next.blood) next.blood = "none";

      // Marking a day unwell sets every symptom to an explicit none, so that
      // "absent" and "never answered" stop being the same value — and flags the
      // list as not yet reviewed, so nothing downstream reads those zeros as
      // an improvement.
      if (action.status === "unwell" && previous.symptomsReviewed === undefined) {
        const zeros: Record<string, Severity> = {};
        for (const s of SYMPTOMS) zeros[s.key] = 0;
        for (const name of action.customSymptoms ?? state.customSymptoms) {
          zeros[CUSTOM_SYMPTOM_PREFIX + name] = 0;
        }
        next.symptoms = { ...zeros, ...previous.symptoms };
        next.symptomsReviewed = false;
      }

      return withDay(state, action.date, next);
    }

    case "day/markWell": {
      const previous = dayAt(state, action.date);
      const lastWell = lastLoggedBefore(state, action.date, (d) => d.status === "well");
      return withDay(state, action.date, {
        ...previous,
        status: "well",
        sputum:
          previous.sputum.color != null
            ? previous.sputum
            : lastWell
              ? { ...lastWell.sputum }
              : { color: 0, volume: 2, texture: 3 },
        blood: previous.blood ?? "none",
        symptoms: {},
      });
    }

    case "day/clear": {
      const days = { ...state.days };
      delete days[action.date];
      return { ...state, days };
    }

    case "day/setCare": {
      const previous = dayAt(state, action.date);
      return withDay(state, action.date, {
        ...previous,
        care: { ...previous.care, [action.treatmentId]: Math.max(0, action.count) },
        // The first tick of the day freezes the plan it is being scored against,
        // so editing the plan later cannot rewrite this day's adherence.
        plan: previous.plan ?? activePlan(action.regimen),
      });
    }

    case "day/setSymptom": {
      const previous = dayAt(state, action.date);
      return withDay(state, action.date, {
        ...previous,
        symptoms: { ...previous.symptoms, [action.key]: action.severity },
        // Touching the list at all is what confirms it was actually answered.
        symptomsReviewed: true,
      });
    }

    case "day/toggleTag": {
      const previous = dayAt(state, action.date);
      const tags = previous.tags.includes(action.tag)
        ? previous.tags.filter((t) => t !== action.tag)
        : [...previous.tags, action.tag];
      return withDay(state, action.date, { ...previous, tags });
    }

    case "day/setPrn": {
      const previous = dayAt(state, action.date);
      return withDay(state, action.date, {
        ...previous,
        prn: { ...previous.prn, [action.name]: Math.max(0, action.count) },
      });
    }

    case "day/setAqi":
      return withDay(state, action.date, { ...dayAt(state, action.date), aqi: action.aqi });

    case "course/add":
      return { ...state, courses: [...state.courses, action.course] };

    case "course/edit":
      return {
        ...state,
        courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };

    case "course/delete":
      return { ...state, courses: state.courses.filter((c) => c.id !== action.id) };

    case "course/endOn":
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === action.id
            ? { ...c, days: Math.max(1, diffDays(c.startDate, action.date) + 1) }
            : c,
        ),
      };

    case "course/setDose": {
      // Kept in its own field rather than in `care`: a course dose landing there
      // would quietly rewrite airway care adherence for every day of the course,
      // and with it every trend built on top of it.
      const previous = dayAt(state, action.date);
      return withDay(state, action.date, {
        ...previous,
        courseDoses: { ...previous.courseDoses, [action.id]: Math.max(0, action.count) },
      });
    }

    case "course/review":
      return {
        ...state,
        courses: state.courses.map((c) => {
          const row = action.rows.find((r) => r.id === c.id);
          if (!row) return c;
          const patch: Partial<Course> = { outcome: row.outcome };
          if (row.betterDay != null) patch.betterDay = row.betterDay;
          if (row.outcomeNote != null) patch.outcomeNote = row.outcomeNote;
          if (row.reviewedWith != null) patch.reviewedWith = row.reviewedWith;
          return { ...c, ...patch };
        }),
      };

    case "regimen/set": {
      const next = { ...state, regimen: action.regimen };
      // A day freezes its plan on the first tick, but today is still in progress,
      // so an edit made today has to reach it. Otherwise pausing a treatment and
      // resuming it the same day leaves it out of today's count while the plan
      // editor still shows it active.
      const todayEntry = state.days[action.today];
      if (todayEntry?.plan) {
        next.days = {
          ...state.days,
          [action.today]: { ...todayEntry, plan: activePlan(action.regimen) },
        };
      }
      return next;
    }

    case "tracking/set":
      return { ...state, track: action.track };

    case "conditions/set":
      return { ...state, conditions: action.conditions };

    case "weightUnit/set":
      return { ...state, weightUnit: action.unit };

    case "reminders/set":
      return { ...state, remindTimes: action.times };

    case "tags/add":
      return state.tags.includes(action.tag) ? state : { ...state, tags: [...state.tags, action.tag] };

    case "tags/delete":
      // Only the suggestion goes. Days already tagged with it keep the tag.
      return { ...state, tags: state.tags.filter((t) => t !== action.tag) };

    case "prnMeds/add":
      return state.prnMeds.includes(action.name)
        ? state
        : { ...state, prnMeds: [...state.prnMeds, action.name] };

    case "prnMeds/delete":
      return { ...state, prnMeds: state.prnMeds.filter((n) => n !== action.name) };

    case "customDrugs/add":
      return state.customDrugs.some((d) => d.name === action.drug.name)
        ? state
        : { ...state, customDrugs: [...state.customDrugs, action.drug] };

    case "customDrugs/delete":
      return { ...state, customDrugs: state.customDrugs.filter((d) => d.name !== action.name) };

    case "customSymptoms/add":
      return state.customSymptoms.includes(action.name)
        ? state
        : { ...state, customSymptoms: [...state.customSymptoms, action.name] };

    case "customSymptoms/delete":
      return { ...state, customSymptoms: state.customSymptoms.filter((n) => n !== action.name) };

    case "locations/add":
      return state.locations.some((l) => l.name === action.location.name)
        ? state
        : { ...state, locations: [action.location, ...state.locations].slice(0, LOCATIONS_KEPT) };

    case "rescue/set":
      return { ...state, rescue: action.items };

    case "appointment/set":
      return { ...state, appt: action.appointment };

    case "questions/set":
      return { ...state, questions: action.questions };

    case "meta/seenIntro":
      return { ...state, meta: { ...state.meta, seenIntro: true } };

    case "meta/seenMilestone":
      return {
        ...state,
        meta: {
          ...state.meta,
          seenMilestones: [...(state.meta.seenMilestones ?? []), action.milestone],
        },
      };

    case "warnings/dismiss":
      return { ...state, ewSeen: action.signature };

    case "ui/setFold":
      return { ...state, folds: { ...state.folds, [action.id]: action.open } };

    case "ui/note":
      return { ...state, noted: { ...state.noted, [action.id]: action.signature } };

    case "log/replace":
      return action.state;

    case "log/wipe":
      return emptyState();
  }
}
