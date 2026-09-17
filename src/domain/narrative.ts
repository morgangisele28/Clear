/**
 * The write-ups: a paragraph for a respiratory team, a fuller record of one
 * episode, and a week at a glance.
 *
 * All of this is generated from the log by arithmetic. Nothing here is written
 * by a language model and nothing is inferred. It is a document that changes
 * what somebody gets prescribed, so nothing in it can be invented: every clause
 * traces back to an entry the person made, and where the log is silent the
 * sentence is left out rather than filled in.
 */

import { addDays, diffDays, type IsoDate } from "./dates.ts";
import { courseResponse } from "./courses.ts";
import { dosesDone, dosesExpected, planFor } from "./care.ts";
import { episodeDates, isOngoing, type Episode } from "./episodes.ts";
import { hasPeakFlowBest, peakFlowContext } from "./analytics.ts";
import {
  capitalise,
  formatDay,
  formatShort,
  formatShortYear,
  formatWeekday,
  listOf,
  plural,
} from "./format.ts";
import {
  bloodLabel,
  bloodRank,
  BLOOD_AGES,
  BLOOD_LOOKS,
  COURSE_OUTCOMES,
  SETTING_PHRASE,
  SEVERITY_LABELS,
  SPUTUM_COLOURS,
  SPUTUM_VOLUMES,
  symptomLabel,
} from "./scales.ts";
import type { DayEntry, Treatment } from "./types.ts";

const colourWord = (i: number) => SPUTUM_COLOURS[i]!.label.toLowerCase();
const volumeWord = (i: number) => SPUTUM_VOLUMES[i]!.label.toLowerCase();

/** Haemoptysis as a phrase: how much, what it looked like, how old. */
export function bloodPhrase(day: DayEntry): string | null {
  if (!day.blood || day.blood === "none") return null;
  const bits = [bloodLabel(day.blood).toLowerCase()];
  const look = BLOOD_LOOKS.find((b) => b.v === day.bloodLook)?.label;
  if (look) bits.push(look.toLowerCase());
  const age = BLOOD_AGES.find((b) => b.v === day.bloodAge)?.label;
  if (age) bits.push(age.toLowerCase());
  return bits.join(", ");
}

/** The symptoms present on a day, worst first, as phrases. */
function symptomPhrases(day: DayEntry, limit = Number.POSITIVE_INFINITY): string[] {
  if (day.symptomsReviewed === false) return [];
  return Object.entries(day.symptoms)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `${symptomLabel(k).toLowerCase()} ${SEVERITY_LABELS[v]!.toLowerCase()}`);
}

/* -------------------------------------------------------------------------- */
/*  The handover paragraph                                                     */
/* -------------------------------------------------------------------------- */

/** Severity at which a symptom is worth naming as what an episode opened with. */
const OPENING_SEVERITY = 2;
/** A fever worth reporting. */
const FEVER_FROM = 37.5;

/**
 * A paragraph to paste into a message to a respiratory team.
 *
 * Written in the first person, because that is who is sending it. The treatment
 * response is read out of the day-by-day entries, so it says things like "cough
 * gone by day four, fatigue never shifted" rather than asking anyone to
 * remember.
 */
export function episodeSummary(
  episode: Episode,
  days: Record<string, DayEntry>,
  regimen: readonly Treatment[] | undefined,
  today: IsoDate,
): string {
  const story: string[] = [];
  const dates = episodeDates(episode);
  const logged = dates.filter((d) => days[d]);
  const ongoing = isOngoing(episode, today);

  story.push(
    ongoing
      ? `I've been unwell since ${formatDay(episode.start)}, so this is day ${episode.span}.`
      : `I was unwell from ${formatDay(episode.start)} to ${formatDay(episode.end)}, ${plural(episode.span, "day")}.`,
  );

  // What it opened with, from the first couple of logged days.
  const opening: string[] = [];
  for (const date of logged.slice(0, 2)) {
    for (const [key, severity] of Object.entries(days[date]!.symptoms)) {
      if (severity < OPENING_SEVERITY) continue;
      const label = symptomLabel(key).toLowerCase();
      if (!opening.includes(label)) opening.push(label);
    }
  }
  if (opening.length) story.push(`It started with ${listOf(opening.slice(0, 4))}.`);

  const colours = logged
    .map((d) => days[d]!.sputum.color)
    .filter((c) => c != null) as number[];
  const volumes = logged
    .map((d) => days[d]!.sputum.volume)
    .filter((v) => v != null) as number[];
  if (colours.length) {
    let sentence = `Sputum went from ${colourWord(colours[0]!)} to ${colourWord(Math.max(...colours))}`;
    if (volumes.length) sentence += ` at up to ${volumeWord(Math.max(...volumes))} volume`;
    story.push(`${sentence}.`);
  }

  const bloodDays = logged.filter((d) => days[d]!.blood && days[d]!.blood !== "none");
  if (bloodDays.length) {
    // The worst day, not the first one. The original wording tested the volume
    // field for "frank", a value that stopped existing when haemoptysis was
    // split into volume and appearance — so every episode read "streaks only",
    // including the ones where somebody brought up a teacup of blood. That is
    // the single most urgent thing this paragraph can carry, and it was being
    // reported as the mildest possible finding.
    const worstDay = bloodDays.reduce((worst, d) =>
      bloodRank(days[d]!.blood) > bloodRank(days[worst]!.blood) ? d : worst,
    );
    const phrase = bloodPhrase(days[worstDay]!);
    story.push(
      `There was blood in it on ${plural(bloodDays.length, "day")}${phrase ? `, at worst ${phrase}` : ""}.`,
    );
  }

  const temps = logged.map((d) => Number.parseFloat(days[d]!.temp)).filter((t) => !Number.isNaN(t));
  if (temps.length && Math.max(...temps) >= FEVER_FROM) {
    story.push(`Temperature peaked at ${Math.max(...temps).toFixed(1)}°C.`);
  }

  const peaks = logged
    .map((d) => Number.parseFloat(days[d]!.peakFlow))
    .filter((v) => !Number.isNaN(v));
  if (peaks.length) {
    const low = Math.min(...peaks);
    const context = peakFlowContext(days, low, today);
    story.push(
      hasPeakFlowBest(context)
        ? `Peak flow dropped to ${low}, ${context.percent}% of my best of ${context.best}.`
        : `Peak flow dropped to ${low}.`,
    );
  }

  const treatment: string[] = [];
  for (const course of episode.courses) {
    const where = SETTING_PHRASE[course.setting];
    let line = `I took ${course.drug}${course.dose ? `, ${course.dose}` : ""}${
      where ? ` (${where})` : ""
    }, starting ${formatDay(course.startDate)}${course.days ? ` for ${plural(course.days, "day")}` : ""}.`;

    const response = courseResponse(course, days, today);
    if (response?.symptoms.length) {
      const eased = response.symptoms.filter((s) => s.improvedDay != null);
      const stuck = response.symptoms.filter((s) => s.improvedDay == null);
      const clauses: string[] = [];
      if (eased.length) {
        const earliest = Math.min(...eased.map((s) => s.improvedDay!));
        clauses.push(
          `${listOf(eased.slice(0, 3).map((s) => symptomLabel(s.key).toLowerCase()))} started easing around day ${earliest}`,
        );
      }
      if (stuck.length) {
        clauses.push(
          `${listOf(stuck.slice(0, 3).map((s) => symptomLabel(s.key).toLowerCase()))} did not shift`,
        );
      }
      if (clauses.length) line += ` ${capitalise(clauses.join(", and "))}.`;
    }

    if (course.outcome) {
      const outcome = COURSE_OUTCOMES.find((o) => o.v === course.outcome);
      if (outcome) line += ` Overall it ${outcome.label.toLowerCase()}.`;
    }
    if (course.outcomeNote) line += ` ${course.outcomeNote}`;
    treatment.push(line);
  }
  if (!episode.courses.length) treatment.push("I did not take any antibiotics for this one.");

  const reported = episode.organisms.filter((o) => o && o !== "Result pending");
  const grew = reported.filter((o) => o !== "No growth");
  if (grew.length) treatment.push(`A sputum sample grew ${listOf(grew)}.`);
  else if (reported.length) treatment.push("A sputum sample was sent and grew nothing.");
  else if (episode.organisms.includes("Result pending")) {
    treatment.push("A sputum sample was sent and the result is not back yet.");
  }

  // Adherence through the episode, since it is the first thing a team asks.
  let done = 0;
  let expected = 0;
  for (const date of logged) {
    done += dosesDone(days[date], regimen);
    expected += dosesExpected(planFor(days[date], regimen));
  }
  if (expected) {
    treatment.push(
      `I kept up ${Math.round((done / expected) * 100)}% of my usual airway care through it, across ${logged.length} of the ${episode.span} days logged.`,
    );
  }

  if (!ongoing) treatment.push(`Symptoms had settled by ${formatDay(episode.end)}.`);

  return `${story.join(" ")}\n\n${treatment.join(" ")}`;
}

/* -------------------------------------------------------------------------- */
/*  The full episode record                                                    */
/* -------------------------------------------------------------------------- */

/** A fuller record of one episode, headline figures followed by day by day. */
export function episodeText(
  episode: Episode,
  days: Record<string, DayEntry>,
  today: IsoDate,
): string {
  const lines: string[] = [];

  lines.push(
    `Episode: ${formatShortYear(episode.start)} to ${formatShortYear(episode.end)} (${plural(episode.span, "day")})`,
  );
  if (episode.peakColour != null) {
    lines.push(`Peak sputum colour: ${SPUTUM_COLOURS[episode.peakColour]!.label}`);
  }
  if (episode.hadBlood) lines.push("Haemoptysis present during this episode.");
  if (episode.maxTemp != null) lines.push(`Highest temperature: ${episode.maxTemp} C`);
  if (episode.minPeakFlow != null) lines.push(`Lowest peak flow: ${episode.minPeakFlow} L/min`);
  if (episode.organisms.length) lines.push(`Sputum culture: ${episode.organisms.join(", ")}`);
  if (episode.meanAqi != null) {
    lines.push(`Mean air quality index during the episode: ${episode.meanAqi}`);
  }

  if (episode.courses.length) {
    lines.push(
      `Treatment: ${episode.courses
        .map((c) => {
          const outcome = COURSE_OUTCOMES.find((o) => o.v === c.outcome);
          return `${c.drug} ${c.dose}`.trim() + (outcome ? ` (${outcome.label.toLowerCase()})` : "");
        })
        .join("; ")}`,
    );
  }

  for (const course of episode.courses) {
    const response = courseResponse(course, days, today);
    if (!response) continue;
    const parts = response.symptoms.map((s) =>
      s.resolvedDay
        ? `${symptomLabel(s.key).toLowerCase()} gone by day ${s.resolvedDay}`
        : s.improvedDay
          ? `${symptomLabel(s.key).toLowerCase()} eased from day ${s.improvedDay}`
          : `${symptomLabel(s.key).toLowerCase()} unchanged`,
    );
    if (
      response.sputumStart != null &&
      response.sputumEnd != null &&
      response.sputumEnd !== response.sputumStart
    ) {
      parts.push(
        `sputum ${SPUTUM_COLOURS[response.sputumStart]!.short.toLowerCase()} to ${SPUTUM_COLOURS[response.sputumEnd]!.short.toLowerCase()}`,
      );
    }
    if (parts.length) lines.push(`Response to ${course.drug}: ${parts.join(", ")}`);
    if (course.outcomeNote) lines.push(`  note: ${course.outcomeNote}`);
  }

  if (episode.tags.length) lines.push(`Tags: ${episode.tags.join(", ")}`);

  lines.push("");
  lines.push("Day by day");
  for (const date of episodeDates(episode)) {
    const day = days[date];
    if (!day) {
      lines.push(`${formatShort(date)}: not logged`);
      continue;
    }
    const bits: string[] = [];
    if (day.sputum.color != null) {
      bits.push(
        colourWord(day.sputum.color) +
          (day.sputum.volume != null ? `, ${volumeWord(day.sputum.volume)}` : ""),
      );
    }
    const blood = bloodPhrase(day);
    if (blood) bits.push(`blood: ${blood}`);
    if (day.temp) bits.push(`${day.temp}C`);
    if (day.spo2) bits.push(`SpO2 ${day.spo2}%`);
    if (day.peakFlow) bits.push(`PF ${day.peakFlow}`);

    const symptoms =
      day.symptomsReviewed === false ? "symptoms not reviewed" : symptomPhrases(day).join(", ");
    if (symptoms) bits.push(symptoms);
    if (day.notes) bits.push(`note: ${day.notes}`);

    lines.push(`${formatShort(date)}: ${bits.join(" | ") || "logged, no detail"}`);
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  The week                                                                   */
/* -------------------------------------------------------------------------- */

/** The last seven days, one line each, for sending to somebody quickly. */
export function weekDigest(
  days: Record<string, DayEntry>,
  regimen: readonly Treatment[] | undefined,
  today: IsoDate,
): string {
  const lines: string[] = [`Clear — week to ${formatShortYear(today)}`, ""];

  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const day = days[date];
    const label = formatWeekday(date);

    if (!day?.status) {
      lines.push(`${label}: not logged`);
      continue;
    }

    const bits: string[] = [day.status === "unwell" ? "unwell" : "well"];

    const expected = dosesExpected(planFor(day, regimen));
    if (expected) bits.push(`care ${dosesDone(day, regimen)}/${expected}`);

    if (day.sputum.color != null) {
      bits.push(
        `sputum ${colourWord(day.sputum.color)}` +
          (day.sputum.volume != null ? `, ${volumeWord(day.sputum.volume)}` : ""),
      );
    }
    const blood = bloodPhrase(day);
    if (blood) bits.push(`blood: ${blood}`);
    if (day.peakFlow) bits.push(`peak flow ${day.peakFlow}`);
    if (day.temp) bits.push(`${day.temp}C`);
    if (day.spo2) bits.push(`SpO2 ${day.spo2}%`);

    const symptoms = symptomPhrases(day, 3);
    if (symptoms.length) bits.push(symptoms.join(", "));
    if (day.notes) bits.push(`note: ${day.notes}`);

    lines.push(`${label}: ${bits.join(" | ")}`);
  }

  return lines.join("\n");
}

/** Days since an episode ended, phrased for a status line. */
export function gapPhrase(previousEnd: IsoDate, start: IsoDate): string {
  const gap = diffDays(previousEnd, start);
  return `${plural(gap, "day")} after the last one`;
}
