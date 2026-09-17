import { describe, expect, it } from "vitest";
import {
  earlyWarning,
  eventLocked,
  hasPeakFlowBest,
  laneSeries,
  leadTimes,
  peakFlowContext,
  warningSignature,
} from "./analytics.ts";
import { buildEpisodes } from "./episodes.ts";
import { makeDay, makeDays, makeTreatment } from "./testing.ts";
import type { IsoDate } from "./dates.ts";
import type { DayEntry } from "./types.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-06-30");
const REGIMEN = [makeTreatment({ id: "saline", target: 2 })];

/** A run of days ending on `to`, described by index counting backwards. */
function backFrom(to: string, count: number, at: (i: number) => Partial<DayEntry>) {
  const spec: Record<string, Partial<DayEntry>> = {};
  const [y, m, day] = to.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < count; i++) {
    const date = new Date(y, m - 1, day - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    spec[key] = at(i);
  }
  return spec;
}

describe("peakFlowContext", () => {
  const settled = (value: string) => ({ status: "well" as const, peakFlow: value });

  it("asks for more readings before it will name a personal best", () => {
    const days = makeDays(backFrom("2025-06-29", 3, () => settled("400")));
    const context = peakFlowContext(days, 350, TODAY);
    expect(hasPeakFlowBest(context)).toBe(false);
    expect(context).toEqual({ needed: 2 });
  });

  it("reads a value against the personal best", () => {
    const days = makeDays(backFrom("2025-06-29", 6, () => settled("400")));
    const context = peakFlowContext(days, 320, TODAY);
    expect(hasPeakFlowBest(context)).toBe(true);
    if (!hasPeakFlowBest(context)) return;
    expect(context.best).toBe(400);
    expect(context.percent).toBe(80);
  });

  it("splits the zones at eighty and fifty per cent", () => {
    const days = makeDays(backFrom("2025-06-29", 6, () => settled("400")));
    const zoneAt = (v: number) => {
      const c = peakFlowContext(days, v, TODAY);
      return hasPeakFlowBest(c) ? c.zone : null;
    };
    expect(zoneAt(400)).toBe("green");
    expect(zoneAt(320)).toBe("green");
    expect(zoneAt(316)).toBe("amber");
    expect(zoneAt(200)).toBe("amber");
    expect(zoneAt(196)).toBe("red");
  });

  it("bands the rounded percentage, not the raw ratio", () => {
    // 319 of 400 is 79.75%, which reads as 80 and therefore green. The zone
    // follows the number shown on screen rather than disagreeing with it.
    const days = makeDays(backFrom("2025-06-29", 6, () => settled("400")));
    const context = peakFlowContext(days, 319, TODAY);
    expect(hasPeakFlowBest(context) && context.percent).toBe(80);
    expect(hasPeakFlowBest(context) && context.zone).toBe("green");
  });

  it("draws the best from settled days only", () => {
    // A best taken from a year that included a bad fortnight would set the bar
    // under where the person actually lives.
    const days = makeDays({
      ...backFrom("2025-06-29", 6, () => settled("400")),
      "2025-06-20": { status: "unwell", peakFlow: "560" },
    });
    const context = peakFlowContext(days, 400, TODAY);
    expect(hasPeakFlowBest(context) && context.best).toBe(400);
  });

  it("ignores readings older than a year", () => {
    const days = makeDays({
      ...backFrom("2025-06-29", 6, () => settled("400")),
      "2023-01-01": { status: "well", peakFlow: "600" },
    });
    const context = peakFlowContext(days, 400, TODAY);
    expect(hasPeakFlowBest(context) && context.best).toBe(400);
  });

  it("can leave today's own reading out of its own baseline", () => {
    const days = makeDays({
      ...backFrom("2025-06-29", 6, () => settled("400")),
      "2025-06-30": { status: "well", peakFlow: "999" },
    });
    const context = peakFlowContext(days, 999, TODAY, d("2025-06-30"));
    expect(hasPeakFlowBest(context) && context.best).toBe(400);
  });
});

describe("earlyWarning", () => {
  it("says nothing about an empty log", () => {
    expect(earlyWarning({}, REGIMEN, TODAY)).toEqual([]);
  });

  it("says nothing on a handful of entries", () => {
    // An app that cries wolf on three entries teaches people to ignore it.
    const days = makeDays(backFrom("2025-06-30", 3, () => ({ status: "well", sputum: { color: 6, volume: null, texture: null } })));
    expect(earlyWarning(days, REGIMEN, TODAY)).toEqual([]);
  });

  it("flags a sustained shift towards purulence", () => {
    const days = makeDays(
      backFrom("2025-06-30", 11, (i) => ({
        status: "well",
        sputum: { color: i < 3 ? 5 : 2, volume: null, texture: null },
      })),
    );
    const warnings = earlyWarning(days, REGIMEN, TODAY);
    expect(warnings.map((w) => w.key)).toContain("sputum-colour");
    expect(warnings.find((w) => w.key === "sputum-colour")!.level).toBe("watch");
  });

  it("does not flag a colour shift too small to mean anything", () => {
    const days = makeDays(
      backFrom("2025-06-30", 11, (i) => ({
        status: "well",
        sputum: { color: i < 3 ? 3 : 2, volume: null, texture: null },
      })),
    );
    expect(earlyWarning(days, REGIMEN, TODAY).map((w) => w.key)).not.toContain("sputum-colour");
  });

  it("flags a drop in peak flow against the readings before it", () => {
    const days = makeDays(
      backFrom("2025-06-30", 9, (i) => ({ status: "well", peakFlow: i < 3 ? "330" : "400" })),
    );
    expect(earlyWarning(days, REGIMEN, TODAY).map((w) => w.key)).toContain("peak-flow");
  });

  it("does not flag peak flow noise", () => {
    const days = makeDays(
      backFrom("2025-06-30", 9, (i) => ({ status: "well", peakFlow: i < 3 ? "390" : "400" })),
    );
    expect(earlyWarning(days, REGIMEN, TODAY).map((w) => w.key)).not.toContain("peak-flow");
  });

  it("flags resting heart rate running above the settled baseline", () => {
    const days = makeDays(
      backFrom("2025-06-30", 12, (i) => ({ status: "well", restHr: i < 3 ? "80" : "65" })),
    );
    const warnings = earlyWarning(days, REGIMEN, TODAY);
    expect(warnings.map((w) => w.key)).toContain("resting-hr");
    // A lift in heart rate is a note, not a watch: it moves for many reasons.
    expect(warnings.find((w) => w.key === "resting-hr")!.level).toBe("note");
  });

  it("flags airway care slipping this week against the three before it", () => {
    const days = makeDays(
      backFrom("2025-06-30", 28, (i) => ({
        status: "well",
        care: { saline: i < 7 ? 0 : 2 },
      })),
    );
    expect(earlyWarning(days, REGIMEN, TODAY).map((w) => w.key)).toContain("care-slip");
  });

  it("does not look at days in the future", () => {
    const days = makeDays({
      ...backFrom("2025-06-30", 11, () => ({ status: "well", sputum: { color: 2, volume: null, texture: null } })),
      "2025-07-05": { status: "unwell", sputum: { color: 7, volume: null, texture: null } },
    });
    expect(earlyWarning(days, REGIMEN, TODAY).map((w) => w.key)).not.toContain("sputum-colour");
  });

  it("shows at most four at once", () => {
    const days = makeDays(
      backFrom("2025-06-30", 30, (i) => ({
        status: "well",
        sputum: { color: i < 3 ? 6 : 1, volume: i < 3 ? 6 : 1, texture: null },
        peakFlow: i < 3 ? "300" : "420",
        restHr: i < 3 ? "90" : "62",
        care: { saline: i < 7 ? 0 : 2 },
      })),
    );
    expect(earlyWarning(days, REGIMEN, TODAY).length).toBeLessThanOrEqual(4);
  });
});

describe("warningSignature", () => {
  it("is stable however the warnings are ordered", () => {
    const a = warningSignature([
      { key: "peak-flow", level: "watch", text: "" },
      { key: "care-slip", level: "note", text: "" },
    ]);
    const b = warningSignature([
      { key: "care-slip", level: "note", text: "" },
      { key: "peak-flow", level: "watch", text: "" },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a new warning appears", () => {
    const one = warningSignature([{ key: "peak-flow", level: "watch", text: "" }]);
    const two = warningSignature([
      { key: "peak-flow", level: "watch", text: "" },
      { key: "sputum-colour", level: "watch", text: "" },
    ]);
    expect(one).not.toBe(two);
  });
});

describe("leadTimes", () => {
  const colour = (day: DayEntry) => day.sputum.color;
  const worse = (v: number, base: number) => v > base;

  /** Settled days at colour 1, then a run-up, then the episode. */
  const logWithRunUp = (runUpDays: number) =>
    makeDays({
      ...backFrom("2025-03-01", 100, () => ({ status: "well", sputum: { color: 1, volume: null, texture: null } })),
      ...backFrom("2025-03-31", runUpDays, () => ({
        status: "well",
        sputum: { color: 5, volume: null, texture: null },
      })),
      "2025-04-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
    });

  it("counts the days a measure was already off baseline before onset", () => {
    const days = logWithRunUp(4);
    const episodes = buildEpisodes(days, [], TODAY);
    expect(leadTimes(days, episodes, colour, worse)).toEqual([{ start: "2025-04-01", days: 4 }]);
  });

  it("stops at the first day that was back to normal", () => {
    // What comes out is the run leading straight into the episode, not any blip
    // in the fortnight before it.
    const days = makeDays({
      ...backFrom("2025-03-31", 100, () => ({ status: "well", sputum: { color: 1, volume: null, texture: null } })),
      ...backFrom("2025-03-31", 2, () => ({ status: "well", sputum: { color: 5, volume: null, texture: null } })),
      "2025-03-25": { status: "well", sputum: { color: 6, volume: null, texture: null } },
      "2025-04-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
    });
    const episodes = buildEpisodes(days, [], TODAY);
    expect(leadTimes(days, episodes, colour, worse)[0]!.days).toBe(2);
  });

  it("carries the run across a day that was simply not logged", () => {
    // A gap is not evidence that the day was back to normal. Treating it as one
    // would report a shorter warning than the person actually had.
    const days = makeDays({
      ...backFrom("2025-03-31", 100, () => ({ status: "well", sputum: { color: 1, volume: null, texture: null } })),
      "2025-03-31": { status: "well", sputum: { color: 5, volume: null, texture: null } },
      "2025-03-30": { status: "well", sputum: { color: 5, volume: null, texture: null } },
      "2025-03-28": { status: "well", sputum: { color: 5, volume: null, texture: null } },
      "2025-04-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
    });
    delete days["2025-03-29"];
    const episodes = buildEpisodes(days, [], TODAY);
    expect(leadTimes(days, episodes, colour, worse)[0]!.days).toBe(4);
  });

  it("says nothing when there is no settled baseline to compare against", () => {
    const days = makeDays({
      "2025-03-30": { status: "well", sputum: { color: 1, volume: null, texture: null } },
      "2025-04-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
    });
    expect(leadTimes(days, buildEpisodes(days, [], TODAY), colour, worse)).toEqual([]);
  });

  it("reports nothing for an episode that arrived with no warning", () => {
    const days = makeDays({
      ...backFrom("2025-03-31", 100, () => ({ status: "well", sputum: { color: 1, volume: null, texture: null } })),
      "2025-04-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
    });
    expect(leadTimes(days, buildEpisodes(days, [], TODAY), colour, worse)).toEqual([]);
  });

  it("does not follow a run-up beyond the lookback", () => {
    const days = logWithRunUp(20);
    const episodes = buildEpisodes(days, [], TODAY);
    expect(leadTimes(days, episodes, colour, worse, 14)[0]!.days).toBe(14);
  });
});

describe("eventLocked", () => {
  const colour = (day: DayEntry) => day.sputum.color;

  it("is null when only one episode contributes", () => {
    // A column averaged from one episode is that episode, not a pattern.
    const days = makeDays(
      backFrom("2025-04-10", 20, () => ({ status: "well", sputum: { color: 3, volume: null, texture: null } })),
    );
    days["2025-04-01"] = makeDay({ status: "unwell", sputum: { color: 6, volume: null, texture: null } });
    const episodes = buildEpisodes(days, [], TODAY);
    expect(eventLocked(days, episodes, colour)).toBeNull();
  });

  it("stacks several episodes at day zero", () => {
    const spec: Record<string, Partial<DayEntry>> = {};
    for (const onset of ["2025-01-15", "2025-03-15", "2025-05-15"]) {
      Object.assign(spec, backFrom(onset, 15, () => ({ status: "well", sputum: { color: 2, volume: null, texture: null } })));
      spec[onset] = { status: "unwell", sputum: { color: 6, volume: null, texture: null } };
    }
    const days = makeDays(spec);
    const columns = eventLocked(days, buildEpisodes(days, [], TODAY), colour)!;
    expect(columns).not.toBeNull();
    const zero = columns.find((c) => c.offset === 0)!;
    expect(zero.n).toBe(3);
    expect(zero.mean).toBe(6);
  });
});

describe("laneSeries", () => {
  const dates = [d("2025-06-01"), d("2025-06-02"), d("2025-06-03")];

  it("returns one value per date in every lane", () => {
    const days = makeDays({
      "2025-06-01": {
        status: "well",
        sputum: { color: 2, volume: null, texture: null },
        care: { saline: 2 },
        symptoms: { cough: 1, fatigue: 2 },
        peakFlow: "400",
        aqi: { value: 42, pm25: null, source: "test" },
      },
    });
    const lanes = laneSeries(days, dates, REGIMEN, 500);
    for (const series of Object.values(lanes)) expect(series).toHaveLength(3);
    expect(lanes.sputum[0]).toBe(2);
    expect(lanes.care[0]).toBe(100);
    expect(lanes.symptoms[0]).toBe(3);
    expect(lanes.peak[0]).toBe(80);
    expect(lanes.aqi[0]).toBe(42);
  });

  it("leaves an unlogged day as a hole rather than a zero", () => {
    const lanes = laneSeries({}, dates, REGIMEN, 500);
    expect(lanes.sputum).toEqual([null, null, null]);
    expect(lanes.care).toEqual([null, null, null]);
    expect(lanes.symptoms).toEqual([null, null, null]);
  });

  it("cannot draw peak flow without a personal best to read it against", () => {
    const days = makeDays({ "2025-06-01": { status: "well", peakFlow: "400" } });
    expect(laneSeries(days, dates, REGIMEN, null).peak[0]).toBeNull();
  });

  it("keeps the lanes in register with the date axis", () => {
    const days = makeDays({ "2025-06-03": { status: "well", sputum: { color: 5, volume: null, texture: null } } });
    expect(laneSeries(days, dates, REGIMEN, 500).sputum).toEqual([null, null, 5]);
  });
});
