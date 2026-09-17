/**
 * Reading and writing the dose on an antibiotic course.
 *
 * A dose is a number and a unit, and a frequency is one of a handful of things,
 * so both are pickers rather than a free text box. Anything genuinely unusual —
 * a loading dose, alternate days — goes in the note, where it stays readable
 * instead of making the dose field unparseable.
 */

import { FREQUENCY_PHRASE } from "./scales.ts";

export interface DoseFields {
  amount: string;
  unit: string;
  /** Doses per day, or 0 when it does not fit a daily frequency. */
  freq: number;
  /** Whatever frequency could not be placed, kept verbatim. */
  freqText: string;
}

/** How the structured fields read as a phrase, e.g. "500 mg twice daily". */
export function doseText(fields: Partial<DoseFields> | null | undefined): string {
  if (!fields) return "";
  const parts: string[] = [];
  const amount = String(fields.amount ?? "").trim();
  if (amount) parts.push(fields.unit ? `${amount} ${fields.unit}` : amount);

  const phrase = fields.freq != null ? FREQUENCY_PHRASE[fields.freq] : undefined;
  if (phrase) parts.push(phrase);
  else {
    const other = String(fields.freqText ?? "").trim();
    if (other) parts.push(other);
  }
  return parts.join(" ").trim();
}

const AMOUNT_RE = /^\s*(\d[\d.,/]*)\s*(mcg|mg|g|ml|units?|puffs?|tablets?|capsules?)\b/i;

/**
 * Reads a dose written as free text well enough to fill the pickers when one is
 * opened for editing. Whatever it cannot place stays in the "something else"
 * box rather than being dropped.
 *
 * This never rewrites the stored `dose` string. That string is what the handover
 * paragraph and the CSV print, and rewording somebody's own record behind their
 * back is not a migration.
 */
export function parseDose(text: string | null | undefined): DoseFields {
  const out: DoseFields = { amount: "", unit: "", freq: 0, freqText: "" };
  const s = String(text ?? "").trim();
  if (!s) return out;

  const m = AMOUNT_RE.exec(s);
  if (m) {
    out.amount = m[1]!;
    out.unit = m[2]!.toLowerCase();
  }
  const rest = m ? s.slice(m[0].length).trim() : s;

  // Checked longest first: "three times" must not be read as "one time" because
  // both contain "time".
  if (/\b(twice|two times|2\s*x|bd|bid)\b/i.test(s)) out.freq = 2;
  else if (/\b(three times|3\s*x|tds|tid)\b/i.test(s)) out.freq = 3;
  else if (/\b(four times|4\s*x|qds|qid)\b/i.test(s)) out.freq = 4;
  else if (/\b(once|one time|1\s*x|daily|od)\b/i.test(s)) out.freq = 1;

  if (!out.freq) out.freqText = rest;
  return out;
}
