/**
 * Counting exacerbation features against the definition for each condition.
 *
 * An exacerbation is defined differently by each condition, and the definitions
 * do not merge — a union of them would be wrong for all of them. The symptoms
 * behind them overlap almost entirely, so they are collected once and each rule
 * is scored on its own. Someone with both bronchiectasis and COPD sees two
 * counts rather than one blended number that would mislead on both.
 *
 * Everything here counts what was logged. None of it is a diagnosis.
 */

import { PURULENT_FROM, VOLUME_RAISED_FROM } from "./scales.ts";
import type { ConditionKey, DayEntry } from "./types.ts";

export type RuleKey = "bronchiectasis" | "copd";

export interface ExacerbationRule {
  key: RuleKey;
  /** How the count reads on screen, e.g. "the 6 standard exacerbation features". */
  label: string;
  /** Features present today, named. */
  present: string[];
  /** How many of them. */
  count: number;
  /** How many the definition has in total. */
  of: number;
  /** The count at which the definition is usually treated as met. */
  threshold: number;
  /** Whether the threshold is reached today. */
  met: boolean;
}

/**
 * Sputum volume counts as raised either because it was said to be — the symptom
 * was ticked — or because the volume recorded is moderate or more. One of those
 * is a judgement and the other is a measurement; either satisfies the feature.
 */
function hasRaisedVolume(day: DayEntry): boolean {
  if ((day.symptoms["sputumUp"] ?? 0) > 0) return true;
  return (day.sputum.volume ?? 0) >= VOLUME_RAISED_FROM;
}

function isPurulent(day: DayEntry): boolean {
  return day.sputum.color != null && day.sputum.color >= PURULENT_FROM;
}

function hasSymptom(day: DayEntry, key: string): boolean {
  return (day.symptoms[key] ?? 0) > 0;
}

function hasHaemoptysis(day: DayEntry): boolean {
  return day.blood != null && day.blood !== "none";
}

/**
 * Scores every definition that applies to the conditions given. A log with no
 * conditions set predates the question being asked, and was scored on the
 * bronchiectasis rule, so it keeps it.
 */
export function exacerbationRules(
  day: DayEntry,
  conditions: readonly ConditionKey[] | undefined,
): ExacerbationRule[] {
  const list = conditions?.length ? conditions : (["bronchiectasis"] as const);
  const has = (k: ConditionKey) => list.includes(k);
  const rules: ExacerbationRule[] = [];

  // BTS-style: three or more of six features, sustained, is the usual threshold
  // for treating rather than waiting it out. Cystic fibrosis is scored the same
  // way here, with the caveat that a real CF assessment also weighs lung
  // function, weight and sinus signs, which this cannot see.
  if (has("bronchiectasis") || has("cf")) {
    const present: string[] = [];
    if (hasSymptom(day, "cough")) present.push("cough");
    if (hasRaisedVolume(day)) present.push("sputum volume");
    if (isPurulent(day)) present.push("purulence");
    if (hasSymptom(day, "breathless")) present.push("breathlessness");
    if (hasSymptom(day, "fatigue")) present.push("fatigue");
    if (hasHaemoptysis(day)) present.push("haemoptysis");
    rules.push({
      key: "bronchiectasis",
      label: "the 6 standard exacerbation features",
      present,
      count: present.length,
      of: 6,
      threshold: 3,
      met: present.length >= 3,
    });
  }

  // Anthonisen: breathlessness, sputum volume, sputum purulence. Two of the
  // three is the usual threshold for treating.
  if (has("copd")) {
    const present: string[] = [];
    if (hasSymptom(day, "breathless")) present.push("breathlessness");
    if (hasRaisedVolume(day)) present.push("sputum volume");
    if (isPurulent(day)) present.push("purulence");
    rules.push({
      key: "copd",
      label: "the 3 COPD exacerbation criteria",
      present,
      count: present.length,
      of: 3,
      threshold: 2,
      met: present.length >= 2,
    });
  }

  return rules;
}
