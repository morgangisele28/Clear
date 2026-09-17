import { describe, expect, it } from "vitest";
import { reduce, type Action } from "./actions.ts";
import { emptyState } from "@/domain/state.ts";
import { makeCourse, makeDay, makeTreatment } from "@/domain/testing.ts";
import type { AppState } from "@/domain/types.ts";
import type { IsoDate } from "@/domain/dates.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-06-15");
const REGIMEN = [
  makeTreatment({ id: "saline", name: "Saline neb", target: 2 }),
  makeTreatment({ id: "nac", name: "NAC", target: 1 }),
];

const base = (patch: Partial<AppState> = {}): AppState => ({ ...emptyState(), ...patch });
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reduce, state);

describe("marking a day", () => {
  it("carries the last sputum reading forward rather than opening blank", () => {
    // Most days are much like the one before. A blank panel asks somebody to
    // re-describe something that has not changed.
    const state = base({
      days: { "2025-06-14": makeDay({ status: "well", sputum: { color: 2, volume: 3, texture: 4 } }) },
    });
    const next = run(state, { type: "day/setStatus", date: TODAY, status: "well" });
    expect(next.days[TODAY]!.sputum).toEqual({ color: 2, volume: 3, texture: 4 });
  });

  it("does not overwrite a reading already made today", () => {
    const state = base({
      days: {
        "2025-06-14": makeDay({ status: "well", sputum: { color: 2, volume: 3, texture: 4 } }),
        [TODAY]: makeDay({ sputum: { color: 6, volume: 5, texture: 5 } }),
      },
    });
    const next = run(state, { type: "day/setStatus", date: TODAY, status: "unwell" });
    expect(next.days[TODAY]!.sputum.color).toBe(6);
  });

  it("sets haemoptysis to an explicit none rather than leaving it unanswered", () => {
    const next = run(base(), { type: "day/setStatus", date: TODAY, status: "well" });
    expect(next.days[TODAY]!.blood).toBe("none");
  });

  it("fills the symptom list with explicit zeros when a day is marked unwell", () => {
    // So that "absent" and "never answered" stop being the same value.
    const next = run(base(), { type: "day/setStatus", date: TODAY, status: "unwell" });
    expect(next.days[TODAY]!.symptoms["cough"]).toBe(0);
    expect(next.days[TODAY]!.symptoms["breathless"]).toBe(0);
  });

  it("flags that list as not yet reviewed", () => {
    // Nothing downstream may read those zeros as an improvement.
    const next = run(base(), { type: "day/setStatus", date: TODAY, status: "unwell" });
    expect(next.days[TODAY]!.symptomsReviewed).toBe(false);
  });

  it("includes the person's own symptoms in that list", () => {
    const state = base({ customSymptoms: ["Sinus pressure"] });
    const next = run(state, { type: "day/setStatus", date: TODAY, status: "unwell" });
    expect(next.days[TODAY]!.symptoms["c:Sinus pressure"]).toBe(0);
  });

  it("does not re-zero a list that has already been answered", () => {
    const state = base({
      days: { [TODAY]: makeDay({ symptoms: { cough: 3 }, symptomsReviewed: true }) },
    });
    const next = run(state, { type: "day/setStatus", date: TODAY, status: "unwell" });
    expect(next.days[TODAY]!.symptoms["cough"]).toBe(3);
    expect(next.days[TODAY]!.symptomsReviewed).toBe(true);
  });

  it("clears symptoms when a day is marked well outright", () => {
    const state = base({ days: { [TODAY]: makeDay({ symptoms: { cough: 2 } }) } });
    const next = run(state, { type: "day/markWell", date: TODAY });
    expect(next.days[TODAY]!.symptoms).toEqual({});
    expect(next.days[TODAY]!.status).toBe("well");
  });

  it("gives a first ever well day a sensible starting reading", () => {
    const next = run(base(), { type: "day/markWell", date: TODAY });
    expect(next.days[TODAY]!.sputum).toEqual({ color: 0, volume: 2, texture: 3 });
  });

  it("removes a day outright when it is cleared", () => {
    const state = base({ days: { [TODAY]: makeDay({ status: "well" }) } });
    expect(run(state, { type: "day/clear", date: TODAY }).days).toEqual({});
  });
});

describe("ticking off care", () => {
  it("freezes the plan on the first tick of the day", () => {
    const state = base({ regimen: REGIMEN });
    const next = run(state, {
      type: "day/setCare",
      date: TODAY,
      treatmentId: "saline",
      count: 1,
      regimen: REGIMEN,
    });
    expect(next.days[TODAY]!.plan).toEqual([
      { id: "saline", name: "Saline neb", target: 2 },
      { id: "nac", name: "NAC", target: 1 },
    ]);
  });

  it("does not re-freeze a plan the day already has", () => {
    const frozen = [{ id: "old", name: "Old", target: 1 }];
    const state = base({ regimen: REGIMEN, days: { [TODAY]: makeDay({ plan: frozen }) } });
    const next = run(state, {
      type: "day/setCare",
      date: TODAY,
      treatmentId: "saline",
      count: 1,
      regimen: REGIMEN,
    });
    expect(next.days[TODAY]!.plan).toEqual(frozen);
  });

  it("never records a negative count", () => {
    const next = run(base(), {
      type: "day/setCare",
      date: TODAY,
      treatmentId: "saline",
      count: -3,
      regimen: REGIMEN,
    });
    expect(next.days[TODAY]!.care["saline"]).toBe(0);
  });
});

describe("answering the symptom list", () => {
  it("confirms the list has been reviewed as soon as it is touched", () => {
    const state = base({ days: { [TODAY]: makeDay({ symptomsReviewed: false }) } });
    const next = run(state, { type: "day/setSymptom", date: TODAY, key: "cough", severity: 2 });
    expect(next.days[TODAY]!.symptomsReviewed).toBe(true);
    expect(next.days[TODAY]!.symptoms["cough"]).toBe(2);
  });
});

describe("course doses", () => {
  it("keeps them out of airway care entirely", () => {
    // A course dose landing in `care` would quietly rewrite adherence for every
    // day of the course, and with it every trend built on top of it.
    const next = run(base(), { type: "course/setDose", date: TODAY, id: "c1", count: 2 });
    expect(next.days[TODAY]!.courseDoses).toEqual({ c1: 2 });
    expect(next.days[TODAY]!.care).toEqual({});
  });

  it("ends a course on a given day by shortening it", () => {
    const state = base({ courses: [makeCourse({ id: "c1", startDate: d("2025-06-10"), days: 14 })] });
    const next = run(state, { type: "course/endOn", id: "c1", date: d("2025-06-14") });
    expect(next.courses[0]!.days).toBe(5);
  });

  it("never shortens a course to nothing", () => {
    const state = base({ courses: [makeCourse({ id: "c1", startDate: d("2025-06-10"), days: 14 })] });
    const next = run(state, { type: "course/endOn", id: "c1", date: d("2025-06-01") });
    expect(next.courses[0]!.days).toBe(1);
  });

  it("settles several courses from one review", () => {
    // A flare is usually treated with two or three things at once.
    const state = base({
      courses: [makeCourse({ id: "c1", drug: "A" }), makeCourse({ id: "c2", drug: "B" })],
    });
    const next = run(state, {
      type: "course/review",
      rows: [
        { id: "c1", outcome: "resolved", betterDay: 3 },
        { id: "c2", outcome: "failed", outcomeNote: "no change at all" },
      ],
    });
    expect(next.courses[0]).toMatchObject({ outcome: "resolved", betterDay: 3 });
    expect(next.courses[1]).toMatchObject({ outcome: "failed", outcomeNote: "no change at all" });
  });

  it("leaves a course the review did not mention alone", () => {
    const state = base({ courses: [makeCourse({ id: "c1" }), makeCourse({ id: "c2" })] });
    const next = run(state, { type: "course/review", rows: [{ id: "c1", outcome: "resolved" }] });
    expect(next.courses[1]!.outcome).toBeUndefined();
  });
});

describe("editing the plan", () => {
  it("reaches today, which is still in progress", () => {
    // Otherwise pausing a treatment and resuming it the same day leaves it out
    // of today's count while the plan editor still shows it active.
    const state = base({
      regimen: REGIMEN,
      days: { [TODAY]: makeDay({ plan: [{ id: "saline", name: "Saline neb", target: 2 }] }) },
    });
    const widened = [...REGIMEN, makeTreatment({ id: "extra", name: "Extra", target: 1 })];
    const next = run(state, { type: "regimen/set", regimen: widened, today: TODAY });
    expect(next.days[TODAY]!.plan).toHaveLength(3);
  });

  it("does not reach back into a day that is already finished", () => {
    const frozen = [{ id: "saline", name: "Saline neb", target: 2 }];
    const state = base({ regimen: REGIMEN, days: { "2025-06-01": makeDay({ plan: frozen }) } });
    const next = run(state, { type: "regimen/set", regimen: [], today: TODAY });
    expect(next.days["2025-06-01"]!.plan).toEqual(frozen);
  });
});

describe("the lists somebody builds up", () => {
  it("does not add the same thing twice", () => {
    const next = run(
      base(),
      { type: "customSymptoms/add", name: "Sinus pressure" },
      { type: "customSymptoms/add", name: "Sinus pressure" },
    );
    expect(next.customSymptoms).toEqual(["Sinus pressure"]);
  });

  it("forgets a suggestion without touching what was already recorded against it", () => {
    // A name typed once is remembered for the dropdown, so a typo would follow
    // somebody around for good. Removing it only forgets the suggestion.
    const state = base({
      tags: ["Dusty loft"],
      days: { "2025-06-01": makeDay({ tags: ["Dusty loft"] }) },
    });
    const next = run(state, { type: "tags/delete", tag: "Dusty loft" });
    expect(next.tags).not.toContain("Dusty loft");
    expect(next.days["2025-06-01"]!.tags).toContain("Dusty loft");
  });

  it("toggles a tag on and off a day", () => {
    const on = run(base(), { type: "day/toggleTag", date: TODAY, tag: "Poor sleep" });
    expect(on.days[TODAY]!.tags).toEqual(["Poor sleep"]);
    const off = run(on, { type: "day/toggleTag", date: TODAY, tag: "Poor sleep" });
    expect(off.days[TODAY]!.tags).toEqual([]);
  });

  it("keeps recent locations, newest first, and does not hoard them", () => {
    let state = base();
    for (let i = 0; i < 15; i++) {
      state = reduce(state, { type: "locations/add", location: { name: `P${i}`, lat: i, lon: i } });
    }
    expect(state.locations).toHaveLength(12);
    expect(state.locations[0]!.name).toBe("P14");
  });
});

describe("wholesale changes", () => {
  it("replaces the whole log on a restore", () => {
    const restored = base({ conditions: ["copd"] });
    expect(run(base(), { type: "log/replace", state: restored }).conditions).toEqual(["copd"]);
  });

  it("wipes back to an empty log", () => {
    const state = base({ days: { [TODAY]: makeDay({ status: "well" }) }, conditions: ["cf"] });
    const next = run(state, { type: "log/wipe" });
    expect(next.days).toEqual({});
    expect(next.conditions).toEqual([]);
  });
});

describe("the reducer itself", () => {
  it("never mutates what it is given", () => {
    const state = base({ days: { [TODAY]: makeDay({ status: "well" }) } });
    const snapshot = JSON.stringify(state);
    run(
      state,
      { type: "day/setStatus", date: TODAY, status: "unwell" },
      { type: "day/setCare", date: TODAY, treatmentId: "saline", count: 1, regimen: REGIMEN },
      { type: "tags/add", tag: "x" },
    );
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
