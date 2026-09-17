/**
 * Bringing a stored log forward to the current schema.
 *
 * This is the most consequential file in the app. What it reads is somebody's
 * years of entries, held in one browser on one device, with no server copy to
 * fall back on. A migration that drops a field does not raise an error; it
 * quietly erases a medical history.
 *
 * Three rules follow from that:
 *
 *   1. Migrations add and translate. They never delete anything they cannot
 *      reconstruct, and they never rewrite text the person wrote themselves.
 *   2. Every step is idempotent. Running the chain twice must give the same
 *      result as running it once, because a half-saved upgrade will do exactly
 *      that on the next load.
 *   3. Anything unknown is carried through untouched rather than dropped, so a
 *      log written by a newer build and opened by an older one loses nothing.
 *
 * Each numbered step below corresponds to a shipped schema version and must
 * keep working forever: a phone that has not opened the app since 2023 is still
 * carrying version 4.
 */

import { parseDose } from "./dose.ts";
import { SCALE_MAX, SEED_QUESTIONS, SEED_TAGS } from "./scales.ts";
import { defaultTracking, emptyDay, emptyState } from "./state.ts";
import { SCHEMA_VERSION } from "./types.ts";
import type { AppState, Course, DayEntry, PlanRow, Question } from "./types.ts";

/** A stored log, before we know anything about its shape. */
type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asRecord = (v: unknown): Raw => (isObject(v) ? v : {});

/**
 * The plan everybody was on before the plan was configurable. Days from that era
 * were scored against it, so they keep it; reconstructing them against a plan
 * edited years later would silently rewrite adherence figures already reported
 * to a clinic.
 */
const PRE_CONFIGURABLE_PLAN: PlanRow[] = [
  { id: "saline", name: "Saline neb", target: 1 },
  { id: "aerobika", name: "Aerobika", target: 1 },
  { id: "nac", name: "NAC", target: 2 },
];

/**
 * The last version in which every log shared that one plan. From version 5 on, a
 * day without a frozen plan means no dose was ticked on it, not that it belongs
 * to the old scheme — so it must be left alone and scored against the live plan.
 *
 * The original code applied the plan above to any day lacking one, with no
 * version guard at all. That kept firing after plans became configurable, which
 * handed treatments like Aerobika to people who have never used one and put
 * their doses into the expected-dose denominator.
 */
const LAST_SHARED_PLAN_VERSION = 5;

/* -------------------------------------------------------------------------- */
/*  Days                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fills in every field a day carries and translates the shapes that changed
 * without a version bump. Safe to run repeatedly.
 */
function normaliseDay(raw: Raw, fromVersion: number): DayEntry {
  const base = emptyDay();
  const day = { ...base, ...raw } as DayEntry & Raw;

  day.care = { ...asRecord(raw["care"]) } as Record<string, number>;
  day.sputum = { ...base.sputum, ...asRecord(raw["sputum"]) } as DayEntry["sputum"];
  day.symptoms = { ...asRecord(raw["symptoms"]) } as DayEntry["symptoms"];
  day.tags = asArray<string>(raw["tags"]);
  day.prn = { ...asRecord(raw["prn"]) } as Record<string, number>;
  day.courseDoses = { ...asRecord(raw["courseDoses"]) } as Record<string, number>;

  // Airway care moved from yes/no flags to a count of sessions done.
  for (const id of ["saline", "aerobika"]) {
    const v = day.care[id];
    if (typeof v === "boolean") day.care[id] = v ? 1 : 0;
  }

  // The mucolytic was two named slots before it was a count.
  if (day.care["nac"] == null) {
    const am = day.care["nacAm"];
    const pm = day.care["nacPm"];
    if (am != null || pm != null) {
      day.care["nac"] = (am ? 1 : 0) + (pm ? 1 : 0);
    }
  }
  delete day.care["nacAm"];
  delete day.care["nacPm"];

  // A day from before plans were configurable keeps the plan it was scored
  // against. See LAST_SHARED_PLAN_VERSION for why this is guarded.
  if (!day.plan && fromVersion <= LAST_SHARED_PLAN_VERSION) {
    day.plan = PRE_CONFIGURABLE_PLAN.map((r) => ({ ...r }));

    // The maintenance inhaler was a field of its own in that era.
    if (day["symbicort"]) {
      day.care["symbicort"] = (day["symbicortTaken"] as number) || 0;
    }
  }
  delete day["symbicort"];
  delete day["symbicortTaken"];

  return day as DayEntry;
}

/** Volume and texture moved from a four step scale to a seven step one. */
function widenSputumScales(day: DayEntry): void {
  const { sputum } = day;
  if (sputum.volume != null) {
    sputum.volume = Math.min(SCALE_MAX, sputum.volume * 2) as DayEntry["sputum"]["volume"];
  }
  if (sputum.texture != null) {
    sputum.texture = Math.min(SCALE_MAX, sputum.texture * 2) as DayEntry["sputum"]["texture"];
  }
}

/**
 * Haemoptysis was a three step yes / streaks / frank. It becomes a volume scale
 * with the look recorded separately.
 *
 * "streaks" carries over exactly. "frank" only ever meant more than streaking,
 * so it lands on the smallest band above that and keeps "blood on its own" as
 * the description. That is an approximation of an entry that never held a
 * volume, not a recovered one.
 */
function splitBloodIntoVolumeAndLook(day: DayEntry): void {
  const blood = day.blood as string | null;
  if (blood === "streaks") {
    day.blood = "specks";
    day.bloodLook = "streaks";
  } else if (blood === "frank") {
    day.blood = "teaspoon";
    day.bloodLook = "frank";
  }
}

/**
 * A plug coming up had a toggle of its own for one release. It is a rare, easily
 * described event, so it belongs with the other one-off notes rather than
 * occupying a permanent switch on a card used every day. Anything already ticked
 * becomes the tag, so it is not lost along with the field.
 */
const PLUG_TAG = "Plug or cast";

function movePlugToTag(day: DayEntry & Raw): void {
  if (day["cast"]) {
    if (!day.tags.includes(PLUG_TAG)) day.tags.push(PLUG_TAG);
  }
  delete day["cast"];
}

/** Older entries stored a single free-text trigger instead of a list of tags. */
function moveTriggerToTags(day: DayEntry & Raw, allTags: string[]): void {
  const trigger = day["trigger"];
  if (typeof trigger === "string" && trigger) {
    if (!day.tags.includes(trigger)) day.tags.push(trigger);
    if (!allTags.includes(trigger)) allTags.push(trigger);
  }
  delete day["trigger"];
}

/* -------------------------------------------------------------------------- */
/*  Courses                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Courses gained structured dose, frequency and note fields. Old ones are read
 * into those fields so the editor opens filled in, but `dose` itself is left
 * exactly as written: it is what the handover paragraph and the CSV print.
 */
function structureCourseDose(course: Raw): Course {
  if (course["amount"] != null) return course as unknown as Course;
  const parsed = parseDose(course["dose"] as string);
  return {
    ...course,
    amount: parsed.amount,
    unit: parsed.unit,
    freq: parsed.freq,
    freqText: parsed.freqText,
    note: (course["note"] as string) || "",
  } as unknown as Course;
}

/* -------------------------------------------------------------------------- */
/*  The chain                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reads a stored log and returns it at the current schema version.
 *
 * `today` is passed in because one step needs to know which day is still in
 * progress. Nothing here reads the clock.
 */
export function migrate(raw: unknown, today: string): AppState {
  const stored = isObject(raw) ? raw : {};
  const fromVersion = typeof stored["v"] === "number" ? stored["v"] : 1;

  const state = { ...emptyState(), ...stored } as AppState & Raw;

  // Collections that a partially written log may be missing entirely.
  state.days = {};
  state.courses = asArray<Raw>(stored["courses"]).map(structureCourseDose);
  state.tags = asArray<string>(stored["tags"]).length
    ? asArray<string>(stored["tags"])
    : [...SEED_TAGS];
  state.customSymptoms = asArray<string>(stored["customSymptoms"]);
  state.prnMeds = asArray<string>(stored["prnMeds"]);
  state.customDrugs = asArray(stored["customDrugs"]);
  state.locations = asArray(stored["locations"]);
  state.regimen = asArray(stored["regimen"]);
  state.rescue = asArray(stored["rescue"]);
  state.remindTimes = asArray<string>(stored["remindTimes"]);
  state.appt = { date: "", who: "", ...asRecord(stored["appt"]) } as AppState["appt"];
  state.track = { ...defaultTracking(), ...asRecord(stored["track"]) } as AppState["track"];
  state.questions = asArray<Question>(stored["questions"]).length
    ? asArray<Question>(stored["questions"])
    : SEED_QUESTIONS.map((q): Question => ({ ...q }));
  state.meta = asRecord(stored["meta"]) as AppState["meta"];
  state.weightUnit = state.weightUnit === "lb" ? "lb" : "kg";

  // A log that predates the question was scored on the bronchiectasis rule, so
  // it keeps it. Checked against what was stored rather than the merged value,
  // because the empty default is itself an empty array.
  state.conditions = asArray(stored["conditions"]).length
    ? asArray(stored["conditions"])
    : "conditions" in stored
      ? []
      : ["bronchiectasis"];

  for (const [date, rawDay] of Object.entries(asRecord(stored["days"]))) {
    const day = normaliseDay(asRecord(rawDay), fromVersion) as DayEntry & Raw;

    moveTriggerToTags(day, state.tags);
    if (fromVersion < 5) widenSputumScales(day);
    if (fromVersion < 7) splitBloodIntoVolumeAndLook(day);
    if (fromVersion < 8) movePlugToTag(day);

    state.days[date] = day;
  }

  // Anyone who paused a treatment and resumed it the same day is carrying a
  // frozen plan for today that no longer matches their regimen. Today's snapshot
  // is re-taken on the next dose either way, so dropping it is safe; earlier
  // days keep theirs.
  if (fromVersion < 6 && state.days[today]) {
    state.days[today]!.plan = null;
  }

  if (fromVersion < 8 && !state.tags.includes(PLUG_TAG)) {
    state.tags.push(PLUG_TAG);
  }

  state.v = SCHEMA_VERSION;
  return state as AppState;
}
