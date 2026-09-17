import { describe, expect, it } from "vitest";
import { bloodPhrase, episodeSummary, episodeText, weekDigest } from "./narrative.ts";
import { buildEpisodes } from "./episodes.ts";
import { makeCourse, makeDay, makeDays, makeTreatment } from "./testing.ts";
import type { IsoDate } from "./dates.ts";
import type { DayEntry } from "./types.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-04-01");
const REGIMEN = [makeTreatment({ id: "saline", name: "Saline neb", target: 2 })];

/** A short episode with a course through it, used by most of the cases below. */
function log(overrides: Record<string, Partial<DayEntry>> = {}) {
  return makeDays({
    "2025-03-01": {
      status: "unwell",
      symptoms: { cough: 3, fatigue: 2, breathless: 2 },
      symptomsReviewed: true,
      sputum: { color: 4, volume: 3, texture: 4 },
      temp: "38.2",
      peakFlow: "300",
      care: { saline: 2 },
    },
    "2025-03-02": {
      status: "unwell",
      symptoms: { cough: 3, fatigue: 2, breathless: 2 },
      symptomsReviewed: true,
      sputum: { color: 6, volume: 5, texture: 5 },
      peakFlow: "280",
      care: { saline: 1 },
    },
    "2025-03-03": {
      status: "unwell",
      symptoms: { cough: 1, fatigue: 2, breathless: 0 },
      symptomsReviewed: true,
      sputum: { color: 3, volume: 3, texture: 3 },
      care: { saline: 2 },
    },
    ...overrides,
  });
}

const courses = [
  makeCourse({
    id: "c1",
    drug: "Ciprofloxacin",
    dose: "500 mg twice daily",
    startDate: d("2025-03-01"),
    days: 3,
    freq: 2,
    outcome: "resolved",
  }),
];

const episodeFrom = (days: Record<string, DayEntry>, c = courses) =>
  buildEpisodes(days, c, TODAY)[0]!;

describe("episodeSummary", () => {
  it("reads as a paragraph somebody could paste into a message", () => {
    const days = log();
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).toMatchInlineSnapshot(`
      "I was unwell from 1 March to 3 March, 3 days. It started with cough, fatigue and breathlessness. Sputum went from yellow to green at up to large volume. Temperature peaked at 38.2°C. Peak flow dropped to 280.

      I took Ciprofloxacin, 500 mg twice daily, starting 1 March for 3 days. Cough and breathlessness started easing around day 3, and fatigue did not shift. Overall it cleared it. I kept up 83% of my usual airway care through it, across 3 of the 3 days logged. Symptoms had settled by 3 March."
    `);
  });

  it("says how long it has been going while it is still running", () => {
    const days = makeDays({
      "2025-03-30": { status: "unwell" },
      "2025-03-31": { status: "unwell" },
    });
    const text = episodeSummary(episodeFrom(days, []), days, REGIMEN, TODAY);
    expect(text).toContain("I've been unwell since 30 March, so this is day 2.");
    expect(text).not.toContain("Symptoms had settled");
  });

  it("says when nothing was taken for it", () => {
    const days = log();
    expect(episodeSummary(episodeFrom(days, []), days, REGIMEN, TODAY)).toContain(
      "I did not take any antibiotics for this one.",
    );
  });

  it("reports the worst day of haemoptysis, not the first", () => {
    // The original tested the volume field for a value that stopped existing when
    // haemoptysis was split into volume and appearance, so every episode read
    // "streaks only" — including the ones that were an emergency.
    const days = log({
      "2025-03-01": { status: "unwell", blood: "specks", bloodLook: "streaks" },
      "2025-03-02": { status: "unwell", blood: "teacup", bloodLook: "frank", bloodAge: "fresh" },
    });
    const text = episodeSummary(episodeFrom(days), days, REGIMEN, TODAY);
    expect(text).toContain("There was blood in it on 2 days, at worst up to a teacup");
    expect(text).not.toContain("streaks only");
  });

  it("says nothing about blood when there was none", () => {
    const days = log();
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).not.toContain("blood");
  });

  it("leaves out a temperature that was never a fever", () => {
    const days = log({ "2025-03-01": { status: "unwell", temp: "36.9" } });
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).not.toContain("Temperature");
  });

  it("reads peak flow against the personal best once there is one", () => {
    const settled: Record<string, Partial<DayEntry>> = {};
    for (let i = 1; i <= 6; i++) {
      settled[`2025-02-1${i}`] = { status: "well", peakFlow: "400" };
    }
    const days = log(settled);
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).toContain(
      "Peak flow dropped to 280, 70% of my best of 400.",
    );
  });

  it("names what grew, or that nothing did", () => {
    const grew = log({ "2025-03-02": { status: "unwell", organism: "Pseudomonas aeruginosa" } });
    expect(episodeSummary(episodeFrom(grew), grew, REGIMEN, TODAY)).toContain(
      "A sputum sample grew Pseudomonas aeruginosa.",
    );

    const nothing = log({ "2025-03-02": { status: "unwell", organism: "No growth" } });
    expect(episodeSummary(episodeFrom(nothing), nothing, REGIMEN, TODAY)).toContain(
      "A sputum sample was sent and grew nothing.",
    );

    const pending = log({ "2025-03-02": { status: "unwell", organism: "Result pending" } });
    expect(episodeSummary(episodeFrom(pending), pending, REGIMEN, TODAY)).toContain(
      "the result is not back yet",
    );
  });

  it("marks a course taken in hospital as a different event from tablets at home", () => {
    const days = log();
    const admitted = [makeCourse({ ...courses[0]!, setting: "hospital" })];
    expect(episodeSummary(episodeFrom(days, admitted), days, REGIMEN, TODAY)).toContain(
      "(in hospital)",
    );
  });

  it("does not dress up at home as anything", () => {
    const days = log();
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).not.toContain("(at home)");
  });

  it("reports adherence against the days actually logged", () => {
    const days = log({ "2025-03-05": { status: "unwell" } });
    expect(episodeSummary(episodeFrom(days), days, REGIMEN, TODAY)).toContain(
      "across 4 of the 5 days logged",
    );
  });

  it("carries a note written about a course through verbatim", () => {
    const days = log();
    const noted = [makeCourse({ ...courses[0]!, outcomeNote: "Made me feel sick throughout." })];
    expect(episodeSummary(episodeFrom(days, noted), days, REGIMEN, TODAY)).toContain(
      "Made me feel sick throughout.",
    );
  });

  it("invents nothing for an episode with a single bare entry", () => {
    const days = makeDays({ "2025-03-01": { status: "unwell" } });
    const text = episodeSummary(episodeFrom(days, []), days, REGIMEN, TODAY);
    expect(text).toContain("I was unwell from 1 March to 1 March, 1 day.");
    expect(text).toContain("I did not take any antibiotics for this one.");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("null");
  });
});

describe("episodeText", () => {
  it("lists the headline figures then the days", () => {
    const days = log();
    expect(episodeText(episodeFrom(days), days, TODAY)).toMatchInlineSnapshot(`
      "Episode: 1 Mar 25 to 3 Mar 25 (3 days)
      Peak sputum colour: Green
      Highest temperature: 38.2 C
      Lowest peak flow: 280 L/min
      Treatment: Ciprofloxacin 500 mg twice daily (cleared it)
      Response to Ciprofloxacin: cough eased from day 3, fatigue unchanged, breathlessness gone by day 3, sputum yellow to pale

      Day by day
      1 Mar: yellow, small | 38.2C | PF 300 | cough severe, fatigue moderate, breathlessness moderate
      2 Mar: green, large | PF 280 | cough severe, fatigue moderate, breathlessness moderate
      3 Mar: pale yellow, small | fatigue moderate, cough mild"
    `);
  });

  it("marks a day inside the episode that was never logged", () => {
    const days = makeDays({ "2025-03-01": { status: "unwell" }, "2025-03-03": { status: "unwell" } });
    expect(episodeText(episodeFrom(days, []), days, TODAY)).toContain("2 Mar: not logged");
  });

  it("says when a symptom list was never actually answered", () => {
    const days = makeDays({
      "2025-03-01": { status: "unwell", symptoms: { cough: 0 }, symptomsReviewed: false },
    });
    expect(episodeText(episodeFrom(days, []), days, TODAY)).toContain("symptoms not reviewed");
  });

  it("does not claim detail for a day that holds none", () => {
    const days = makeDays({ "2025-03-01": { status: "unwell" } });
    expect(episodeText(episodeFrom(days, []), days, TODAY)).toContain("1 Mar: logged, no detail");
  });
});

describe("weekDigest", () => {
  it("gives one line per day for the last seven", () => {
    const days = makeDays({
      "2025-04-01": { status: "well", care: { saline: 2 }, sputum: { color: 1, volume: 2, texture: 3 } },
      "2025-03-31": {
        status: "unwell",
        care: { saline: 1 },
        sputum: { color: 5, volume: 4, texture: 4 },
        symptoms: { cough: 2, fatigue: 1 },
        symptomsReviewed: true,
        peakFlow: "300",
        temp: "37.8",
        notes: "rang the surgery",
      },
    });
    expect(weekDigest(days, REGIMEN, TODAY)).toMatchInlineSnapshot(`
      "Clear — week to 1 Apr 25

      Wed 26 Mar: not logged
      Thu 27 Mar: not logged
      Fri 28 Mar: not logged
      Sat 29 Mar: not logged
      Sun 30 Mar: not logged
      Mon 31 Mar: unwell | care 1/2 | sputum yellow green, moderate | peak flow 300 | 37.8C | cough moderate, fatigue mild | note: rang the surgery
      Tue 1 Apr: well | care 2/2 | sputum white, scant"
    `);
  });

  it("shows at most the three worst symptoms", () => {
    const days = makeDays({
      "2025-04-01": {
        status: "unwell",
        symptoms: { cough: 3, fatigue: 3, breathless: 2, wheeze: 1, chest: 1 },
        symptomsReviewed: true,
      },
    });
    const line = weekDigest(days, REGIMEN, TODAY).split("\n").at(-1)!;
    expect(line).toContain("cough severe");
    expect(line).not.toContain("wheeze");
  });

  it("marks a day with an entry but no status as not logged", () => {
    const days = makeDays({ "2025-04-01": { status: null, notes: "typed and left" } });
    expect(weekDigest(days, REGIMEN, TODAY)).toContain("Tue 1 Apr: not logged");
  });
});

describe("bloodPhrase", () => {
  it("reads volume, appearance and age together", () => {
    expect(bloodPhrase(makeDay({ blood: "teacup", bloodLook: "frank", bloodAge: "fresh" }))).toBe(
      "up to a teacup, blood on its own, bright red",
    );
  });

  it("gives just the volume when nothing else was recorded", () => {
    expect(bloodPhrase(makeDay({ blood: "specks" }))).toBe("specks or streaks");
  });

  it("is null for none and for unanswered", () => {
    expect(bloodPhrase(makeDay({ blood: "none" }))).toBeNull();
    expect(bloodPhrase(makeDay({ blood: null }))).toBeNull();
  });
});
