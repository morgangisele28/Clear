/**
 * The scales Clear records against.
 *
 * These are fixed on purpose. A reading taken in July has to be comparable with
 * one taken next February, and it only is if the steps never move underneath it.
 * Adding a step in the middle of one of these scales rewrites the meaning of
 * every entry already recorded against it, so it is a migration, not an edit.
 */

import type {
  BloodAge,
  BloodLook,
  BloodVolume,
  ConditionKey,
  CourseOutcome,
  CourseSetting,
  DrugSuggestion,
  Severity,
  TrackableKey,
} from "./types.ts";

/* -------------------------------------------------------------------------- */
/*  Sputum                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Eight steps from clear to rust. The hex values are the colour chart people
 * match against, so they are reference values rather than theme colours and do
 * not change with light or dark mode.
 */
export const SPUTUM_COLOURS = [
  { hex: "#DEE7EB", label: "Clear", short: "Clear" },
  { hex: "#F1F3F0", label: "White", short: "White" },
  { hex: "#EEE2C2", label: "Cream", short: "Cream" },
  { hex: "#E6CE80", label: "Pale yellow", short: "Pale" },
  { hex: "#D6AA2E", label: "Yellow", short: "Yellow" },
  { hex: "#AFAE3E", label: "Yellow green", short: "Y-green" },
  { hex: "#6D8E3B", label: "Green", short: "Green" },
  { hex: "#7A4A2A", label: "Brown rust", short: "Brown" },
] as const;

/**
 * Purulence starts at yellow — index 4, the step above pale yellow. This is the
 * threshold both exacerbation definitions test, so it is named once here rather
 * than repeated as a bare 4 in each of them.
 */
export const PURULENT_FROM = 4;

/** Seven steps, each anchored to something you can picture without measuring. */
export const SPUTUM_VOLUMES = [
  { label: "None", hint: "" },
  { label: "Trace", hint: "a smear" },
  { label: "Scant", hint: "under a teaspoon" },
  { label: "Small", hint: "a teaspoon" },
  { label: "Moderate", hint: "a tablespoon" },
  { label: "Large", hint: "two tablespoons" },
  { label: "Copious", hint: "more than an eggcup" },
] as const;

/** A raised volume for exacerbation scoring: "moderate", about a tablespoon. */
export const VOLUME_RAISED_FROM = 4;

export const SPUTUM_TEXTURES = [
  "Watery",
  "Runny",
  "Thin",
  "Medium",
  "Thick",
  "Sticky",
  "Rubbery",
] as const;

/** Highest index on the seven-step volume and texture scales. */
export const SCALE_MAX = 6;

/* -------------------------------------------------------------------------- */
/*  Haemoptysis                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How much blood came up over the day, which is what decides urgency, described
 * separately from what it looked like — the two are not the same question. Blood
 * worked through mucus and blood on its own can be the same volume and mean
 * different things.
 *
 * The bands follow the categories in common clinical use: streaking under a
 * teaspoon, then rising, with roughly a teacup over 24 hours as the point treated
 * as an emergency. Anchors are household objects because nobody measures this.
 */
export const BLOOD_VOLUMES: readonly { v: BloodVolume; label: string; hint: string }[] = [
  { v: "none", label: "None", hint: "" },
  { v: "specks", label: "Specks or streaks", hint: "flecks through the phlegm" },
  { v: "teaspoon", label: "Up to a teaspoon", hint: "about 5 ml across the day" },
  { v: "eggcup", label: "Up to an eggcup", hint: "a teaspoon to about 50 ml" },
  { v: "teacup", label: "Up to a teacup", hint: "50 ml or more — call today" },
  { v: "more", label: "More than a teacup", hint: "treated as an emergency" },
] as const;

export const BLOOD_LOOKS: readonly { v: BloodLook; label: string }[] = [
  { v: "streaks", label: "Streaked through it" },
  { v: "mixed", label: "Mixed all through" },
  { v: "clots", label: "Clots or jelly" },
  { v: "frank", label: "Blood on its own" },
] as const;

export const BLOOD_AGES: readonly { v: BloodAge; label: string }[] = [
  { v: "fresh", label: "Bright red" },
  { v: "old", label: "Dark or brown" },
] as const;

export function bloodLabel(v: BloodVolume): string {
  return BLOOD_VOLUMES.find((b) => b.v === v)?.label ?? v;
}

/* -------------------------------------------------------------------------- */
/*  Symptoms                                                                   */
/* -------------------------------------------------------------------------- */

export const SEVERITY_LABELS = ["None", "Mild", "Moderate", "Severe"] as const;
export const SEVERITY_MARKS = ["–", "1", "2", "3"] as const;

export function severityLabel(v: Severity): string {
  return SEVERITY_LABELS[v];
}

export const SYMPTOMS: readonly { key: string; label: string }[] = [
  { key: "cough", label: "Cough" },
  { key: "sputumUp", label: "More sputum than usual" },
  { key: "breathless", label: "Breathlessness" },
  { key: "fatigue", label: "Fatigue" },
  { key: "chest", label: "Chest tightness or pain" },
  { key: "sensitivity", label: "Lung sensitivity" },
  { key: "wheeze", label: "Wheeze" },
  { key: "fever", label: "Fever or chills" },
  { key: "sinus", label: "Nasal or sinus" },
  { key: "throat", label: "Sore throat" },
] as const;

/** Custom symptoms are stored with this prefix so they cannot collide with built-ins. */
export const CUSTOM_SYMPTOM_PREFIX = "c:";

export function symptomLabel(key: string): string {
  if (key.startsWith(CUSTOM_SYMPTOM_PREFIX)) return key.slice(CUSTOM_SYMPTOM_PREFIX.length);
  return SYMPTOMS.find((s) => s.key === key)?.label ?? key;
}

/* -------------------------------------------------------------------------- */
/*  Conditions                                                                 */
/* -------------------------------------------------------------------------- */

export const CONDITIONS: readonly { key: ConditionKey; label: string }[] = [
  { key: "bronchiectasis", label: "Bronchiectasis" },
  { key: "cf", label: "Cystic fibrosis" },
  { key: "copd", label: "COPD or chronic bronchitis" },
] as const;

/* -------------------------------------------------------------------------- */
/*  Courses                                                                    */
/* -------------------------------------------------------------------------- */

export const COURSE_SETTINGS: readonly { v: CourseSetting; label: string }[] = [
  { v: "home", label: "At home" },
  { v: "ivhome", label: "IV at home" },
  { v: "hospital", label: "In hospital" },
] as const;

/** How a setting reads inside a sentence. "At home" is the unmarked case. */
export const SETTING_PHRASE: Partial<Record<CourseSetting, string>> = {
  ivhome: "IV at home",
  hospital: "in hospital",
};

export const COURSE_OUTCOMES: readonly { v: CourseOutcome; label: string }[] = [
  { v: "resolved", label: "Cleared it" },
  { v: "partial", label: "Partly helped" },
  { v: "failed", label: "Didn't work" },
] as const;

/** Starting points to save typing. Every field is editable once chosen. */
export const DRUG_SUGGESTIONS: readonly DrugSuggestion[] = [
  { name: "Azithromycin (Z-Pak)", dose: "500 mg d1, 250 mg d2–5", days: 5 },
  { name: "Ciprofloxacin", dose: "500 mg twice daily", days: 14 },
  { name: "Amoxicillin/clavulanate", dose: "875/125 mg twice daily", days: 7 },
  { name: "Doxycycline", dose: "100 mg twice daily", days: 7 },
  { name: "Amikacin (nebulised)", dose: "", days: 14 },
  { name: "Piperacillin/tazobactam (IV)", dose: "4.5 g every 6–8 h", days: 14 },
  { name: "Prednisolone", dose: "", days: 5 },
  { name: "Guaifenesin (Mucinex)", dose: "600 mg twice daily", days: 7 },
  { name: "Other", dose: "", days: 7 },
] as const;

export const DOSE_UNITS = ["mg", "mcg", "g", "ml", "puffs", "tablets", "capsules", "units"] as const;

export const FREQUENCIES: readonly { v: number; label: string }[] = [
  { v: 1, label: "Once a day" },
  { v: 2, label: "Twice a day" },
  { v: 3, label: "Three times a day" },
  { v: 4, label: "Four times a day" },
  { v: 0, label: "Something else" },
] as const;

export const FREQUENCY_PHRASE: Record<number, string> = {
  1: "once daily",
  2: "twice daily",
  3: "three times daily",
  4: "four times daily",
};

export const ORGANISMS = [
  "",
  "No growth",
  "Pseudomonas aeruginosa",
  "Haemophilus influenzae",
  "Streptococcus pneumoniae",
  "Staphylococcus aureus",
  "Moraxella catarrhalis",
  "Non-tuberculous mycobacteria",
  "Aspergillus",
  "Mixed flora",
  "Result pending",
  "Other",
] as const;

/* -------------------------------------------------------------------------- */
/*  What gets tracked                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Not everyone owns a peak flow meter or an oximeter, and a box you can never
 * fill is worse than no box. Turning one off hides its field and stops it
 * prompting, and never touches anything already recorded.
 *
 * The three that default off were added after the app shipped: a log that
 * already exists gains no new boxes without being asked.
 */
export const TRACKABLES: readonly {
  key: TrackableKey;
  label: string;
  note: string;
  defaultOn: boolean;
}[] = [
  { key: "peakFlow", label: "Peak flow", note: "Needs a peak flow meter", defaultOn: true },
  { key: "fev1", label: "FEV1", note: "From a home spirometer, in litres", defaultOn: false },
  { key: "spo2", label: "Oxygen saturation", note: "Needs a pulse oximeter", defaultOn: true },
  { key: "temp", label: "Temperature", note: "Needs a thermometer", defaultOn: true },
  { key: "restHr", label: "Resting heart rate", note: "From a watch, or counted", defaultOn: true },
  { key: "weight", label: "Weight", note: "Watched closely in cystic fibrosis", defaultOn: false },
  { key: "mmrc", label: "Breathlessness grade", note: "The MRC 0 to 4 scale, now and then", defaultOn: false },
  { key: "aqi", label: "Air quality", note: "Looked up for where you are", defaultOn: true },
  { key: "culture", label: "Sputum cultures", note: "Samples you send off", defaultOn: true },
] as const;

/**
 * mMRC. Kept apart from the daily breathlessness symptom on purpose: that one
 * asks how today is, this one asks what you can usually manage, which moves over
 * months rather than days.
 */
export const MMRC_GRADES = ["0", "1", "2", "3", "4"] as const;

/* -------------------------------------------------------------------------- */
/*  Air quality                                                                */
/* -------------------------------------------------------------------------- */

/** US EPA breakpoints. */
export const AQI_BANDS: readonly { max: number; label: string }[] = [
  { max: 50, label: "Good" },
  { max: 100, label: "Moderate" },
  { max: 150, label: "Unhealthy for sensitive groups" },
  { max: 200, label: "Unhealthy" },
  { max: 300, label: "Very unhealthy" },
  { max: Number.POSITIVE_INFINITY, label: "Hazardous" },
] as const;

export function aqiBand(value: number): { max: number; label: string } {
  return AQI_BANDS.find((b) => value <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1]!;
}

/* -------------------------------------------------------------------------- */
/*  Seeds                                                                      */
/* -------------------------------------------------------------------------- */

export const SEED_TAGS = [
  "Household illness",
  "Travel or flight",
  "Poor sleep",
  "Air quality",
  "Saw the doctor",
  "Missed airway care",
  "Plug or cast",
] as const;

/**
 * Suggestions, not a starting plan. A plan belongs to the person following it,
 * and starting everyone on somebody else's treatments makes the care ring a lie
 * until they notice and fix it.
 */
export const SUGGESTED_CARE: readonly { name: string; target: number }[] = [
  { name: "Nebulised saline", target: 1 },
  { name: "Airway clearance device", target: 1 },
  { name: "Breathing exercises", target: 1 },
  { name: "Mucolytic", target: 2 },
  { name: "Preventer inhaler", target: 2 },
  { name: "Nebulised antibiotic", target: 2 },
  { name: "Exercise", target: 1 },
] as const;

export const SEED_QUESTIONS = [
  {
    id: "q-plan",
    text: "Ask for a written action plan: when to start standby antibiotics, and the peak flow number that means call you.",
    done: false,
  },
] as const;

/** Clear runs worth marking, in days. */
export const MILESTONES = [30, 60, 90, 180, 270, 365] as const;
