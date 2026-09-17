import { describe, expect, it } from "vitest";
import { activePlan, careComplete, carePercent, careRun, dosesDone, dosesExpected, planFor } from "./care.ts";
import { makeDay, makeDays, makeTreatment } from "./testing.ts";
import type { IsoDate } from "./dates.ts";
import type { Treatment } from "./types.ts";

const d = (s: string) => s as IsoDate;

const REGIMEN: Treatment[] = [
  makeTreatment({ id: "saline", name: "Saline neb", target: 1 }),
  makeTreatment({ id: "aerobika", name: "Aerobika", target: 1 }),
  makeTreatment({ id: "nac", name: "NAC", target: 2 }),
];

describe("activePlan", () => {
  it("lists what is switched on and asks for a dose", () => {
    expect(activePlan(REGIMEN).map((r) => r.id)).toEqual(["saline", "aerobika", "nac"]);
  });

  it("leaves out a paused treatment", () => {
    // Stopping a steroid inhaler during a course should read as paused, not as a
    // run of missed doses.
    const paused = [...REGIMEN, makeTreatment({ id: "sym", name: "Symbicort", target: 2, active: false })];
    expect(activePlan(paused).map((r) => r.id)).not.toContain("sym");
  });

  it("leaves out a treatment that asks for no doses", () => {
    const none = [...REGIMEN, makeTreatment({ id: "x", name: "As needed", target: 0 })];
    expect(activePlan(none).map((r) => r.id)).not.toContain("x");
  });

  it("handles no regimen at all", () => {
    expect(activePlan(undefined)).toEqual([]);
    expect(activePlan([])).toEqual([]);
  });
});

describe("planFor", () => {
  it("uses the plan the day froze, not the plan as it stands now", () => {
    const frozen = [{ id: "old", name: "Old neb", target: 3 }];
    const day = makeDay({ plan: frozen });
    expect(planFor(day, REGIMEN)).toEqual(frozen);
  });

  it("falls back to the live plan when the day never froze one", () => {
    expect(planFor(makeDay({ plan: null }), REGIMEN).map((r) => r.id)).toEqual([
      "saline",
      "aerobika",
      "nac",
    ]);
  });

  it("treats an empty frozen plan as no plan", () => {
    expect(planFor(makeDay({ plan: [] }), REGIMEN)).toHaveLength(3);
  });

  it("handles a day that does not exist", () => {
    expect(planFor(undefined, REGIMEN)).toHaveLength(3);
  });
});

describe("dosesExpected", () => {
  it("adds the targets up", () => {
    expect(dosesExpected(activePlan(REGIMEN))).toBe(4);
  });

  it("is zero for no plan", () => {
    expect(dosesExpected([])).toBe(0);
    expect(dosesExpected(undefined)).toBe(0);
  });
});

describe("dosesDone", () => {
  it("counts doses ticked off", () => {
    const day = makeDay({ care: { saline: 1, nac: 2 } });
    expect(dosesDone(day, REGIMEN)).toBe(3);
  });

  it("does not count past the target", () => {
    // Seven sessions in one day is not seven days of doing the plan.
    const day = makeDay({ care: { saline: 7 } });
    expect(dosesDone(day, REGIMEN)).toBe(1);
  });

  it("ignores a treatment that is not on the plan", () => {
    const day = makeDay({ care: { somethingElse: 5 } });
    expect(dosesDone(day, REGIMEN)).toBe(0);
  });

  it("never counts antibiotic course doses", () => {
    // A two week course must not inflate airway care adherence for every day it
    // spans, and with it every trend built on it.
    const day = makeDay({ care: { saline: 1 }, courseDoses: { c1: 2 } });
    expect(dosesDone(day, REGIMEN)).toBe(1);
  });

  it("is zero for a day that does not exist", () => {
    expect(dosesDone(undefined, REGIMEN)).toBe(0);
  });
});

describe("careComplete", () => {
  it("is true only when the whole plan is done", () => {
    expect(careComplete(makeDay({ care: { saline: 1, aerobika: 1, nac: 2 } }), REGIMEN)).toBe(true);
    expect(careComplete(makeDay({ care: { saline: 1, aerobika: 1, nac: 1 } }), REGIMEN)).toBe(false);
  });

  it("is false for a day that does not exist", () => {
    expect(careComplete(undefined, REGIMEN)).toBe(false);
  });

  it("is false when there is no plan, rather than vacuously true", () => {
    expect(careComplete(makeDay({ care: {} }), [])).toBe(false);
  });

  it("scores against the frozen plan when there is one", () => {
    // The day was lived under a one item plan and finished it. Adding two more
    // treatments this year does not make that day incomplete.
    const day = makeDay({ plan: [{ id: "saline", name: "Saline neb", target: 1 }], care: { saline: 1 } });
    expect(careComplete(day, REGIMEN)).toBe(true);
  });
});

describe("carePercent", () => {
  it("reads care as a share of the plan", () => {
    expect(carePercent(makeDay({ status: "well", care: { saline: 1, nac: 1 } }), REGIMEN)).toBe(50);
  });

  it("is null on a day that was never logged either way", () => {
    expect(carePercent(makeDay({ status: null, care: { saline: 1 } }), REGIMEN)).toBeNull();
  });

  it("is null when there is no plan to score against", () => {
    expect(carePercent(makeDay({ status: "well" }), [])).toBeNull();
  });
});

describe("careRun", () => {
  const full = { care: { saline: 1, aerobika: 1, nac: 2 } };
  const partial = { care: { saline: 1 } };

  it("reports no plan when there is none", () => {
    expect(careRun({}, [], d("2025-06-15"))).toEqual({
      current: 0,
      best: 0,
      rate: null,
      hasPlan: false,
    });
  });

  it("counts a run ending today", () => {
    const days = makeDays({
      "2025-06-13": full,
      "2025-06-14": full,
      "2025-06-15": full,
    });
    expect(careRun(days, REGIMEN, d("2025-06-15")).current).toBe(3);
  });

  it("does not call the streak broken before today is finished", () => {
    // At nine in the morning nothing has been done yet. Yesterday's run stands.
    const days = makeDays({
      "2025-06-13": full,
      "2025-06-14": full,
      "2025-06-15": { care: {} },
    });
    expect(careRun(days, REGIMEN, d("2025-06-15")).current).toBe(2);
  });

  it("counts today once it is finished", () => {
    const days = makeDays({ "2025-06-14": partial, "2025-06-15": full });
    expect(careRun(days, REGIMEN, d("2025-06-15")).current).toBe(1);
  });

  it("breaks the run on a missed day", () => {
    const days = makeDays({
      "2025-06-12": full,
      "2025-06-13": partial,
      "2025-06-14": full,
      "2025-06-15": full,
    });
    expect(careRun(days, REGIMEN, d("2025-06-15")).current).toBe(2);
  });

  it("breaks the run on a day with no entry at all", () => {
    const days = makeDays({ "2025-06-12": full, "2025-06-14": full, "2025-06-15": full });
    expect(careRun(days, REGIMEN, d("2025-06-15")).current).toBe(2);
  });

  it("remembers the best run even after it has been broken", () => {
    const days = makeDays({
      "2025-06-01": full,
      "2025-06-02": full,
      "2025-06-03": full,
      "2025-06-04": full,
      "2025-06-05": partial,
      "2025-06-15": full,
    });
    const run = careRun(days, REGIMEN, d("2025-06-15"));
    expect(run.best).toBe(4);
    expect(run.current).toBe(1);
  });

  it("reads the fortnight rate off the last fourteen days", () => {
    const spec: Record<string, { care: Record<string, number> }> = {};
    for (let i = 0; i < 14; i++) {
      const date = `2025-06-${String(15 - i).padStart(2, "0")}`;
      spec[date] = i < 7 ? full : partial;
    }
    expect(careRun(makeDays(spec), REGIMEN, d("2025-06-15")).rate).toBeCloseTo(0.5);
  });

  it("does not let a day beyond the fortnight into the rate", () => {
    const days = makeDays({ "2025-05-01": full, "2025-06-15": full });
    expect(careRun(days, REGIMEN, d("2025-06-15")).rate).toBeCloseTo(1 / 14);
  });

  it("copes with an empty log", () => {
    expect(careRun({}, REGIMEN, d("2025-06-15"))).toMatchObject({ current: 0, best: 0, rate: 0 });
  });
});
