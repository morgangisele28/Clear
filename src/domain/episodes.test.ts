import { describe, expect, it } from "vitest";
import {
  buildEpisodes,
  episodeDates,
  episodesInYear,
  gapsBetween,
  isOngoing,
  recoveryTrend,
  seasonality,
  wellRun,
} from "./episodes.ts";
import { makeCourse, makeDays } from "./testing.ts";
import type { IsoDate } from "./dates.ts";
import type { DayEntry } from "./types.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-06-30");

const unwellOn = (...dates: string[]): Record<string, DayEntry> =>
  makeDays(Object.fromEntries(dates.map((x) => [x, { status: "unwell" as const }])));

describe("grouping unwell days into episodes", () => {
  it("makes one episode from consecutive unwell days", () => {
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-01-02", "2025-01-03"), [], TODAY);
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ start: "2025-01-01", end: "2025-01-03", span: 3, loggedDays: 3 });
  });

  it("holds an episode together across a gap of up to a week", () => {
    // A couple of better days in the middle of a bad fortnight is one illness.
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-01-08"), [], TODAY);
    expect(eps).toHaveLength(1);
    expect(eps[0]!.span).toBe(8);
  });

  it("closes an episode after a clear week", () => {
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-01-09"), [], TODAY);
    expect(eps).toHaveLength(2);
  });

  it("separates two infections a month apart", () => {
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-02-01"), [], TODAY);
    expect(eps).toHaveLength(2);
    expect(eps.map((e) => e.index)).toEqual([1, 2]);
  });

  it("numbers episodes oldest first, whatever order the days arrive in", () => {
    const eps = buildEpisodes(unwellOn("2025-03-01", "2025-01-01", "2025-02-01"), [], TODAY);
    expect(eps.map((e) => e.start)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
  });

  it("puts a day marked unwell in hindsight into the right episode", () => {
    // Setting the real onset date backfills days, and they must join the episode
    // they belong to rather than opening one of their own.
    const eps = buildEpisodes(unwellOn("2025-01-05", "2025-01-06", "2025-01-03"), [], TODAY);
    expect(eps).toHaveLength(1);
    expect(eps[0]!.start).toBe("2025-01-03");
  });

  it("ignores well days and days with no status", () => {
    const days = makeDays({
      "2025-01-01": { status: "well" },
      "2025-01-02": { status: null, notes: "typed something and left" },
      "2025-01-03": { status: "unwell" },
    });
    const eps = buildEpisodes(days, [], TODAY);
    expect(eps).toHaveLength(1);
    expect(eps[0]!.start).toBe("2025-01-03");
  });

  it("gives an empty log no episodes", () => {
    expect(buildEpisodes({}, [], TODAY)).toEqual([]);
  });

  it("counts the span in calendar days but logged days separately", () => {
    // Somebody too ill to fill the app in leaves holes. Reporting the span as
    // though every day of it were recorded would overstate what the log holds.
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-01-05"), [], TODAY);
    expect(eps[0]!.span).toBe(5);
    expect(eps[0]!.loggedDays).toBe(2);
  });
});

describe("what an episode carries", () => {
  const days = makeDays({
    "2025-01-01": {
      status: "unwell",
      sputum: { color: 4, volume: null, texture: null },
      temp: "37.8",
      peakFlow: "320",
      tags: ["Household illness"],
      aqi: { value: 40, pm25: null, source: "test" },
    },
    "2025-01-02": {
      status: "unwell",
      sputum: { color: 6, volume: null, texture: null },
      temp: "38.4",
      peakFlow: "280",
      blood: "specks",
      organism: "Pseudomonas aeruginosa",
      tags: ["Poor sleep"],
      aqi: { value: 60, pm25: null, source: "test" },
    },
  });

  it("takes the peak sputum colour, the worst temperature and the lowest peak flow", () => {
    const ep = buildEpisodes(days, [], TODAY)[0]!;
    expect(ep.peakColour).toBe(6);
    expect(ep.maxTemp).toBe(38.4);
    expect(ep.minPeakFlow).toBe(280);
  });

  it("records that there was blood at all", () => {
    expect(buildEpisodes(days, [], TODAY)[0]!.hadBlood).toBe(true);
  });

  it("does not count an explicit none as blood", () => {
    const none = makeDays({ "2025-01-01": { status: "unwell", blood: "none" } });
    expect(buildEpisodes(none, [], TODAY)[0]!.hadBlood).toBe(false);
  });

  it("collects tags and organisms without repeating them", () => {
    const ep = buildEpisodes(days, [], TODAY)[0]!;
    expect(ep.tags).toEqual(["Household illness", "Poor sleep"]);
    expect(ep.organisms).toEqual(["Pseudomonas aeruginosa"]);
  });

  it("averages the air quality across the days that have it", () => {
    expect(buildEpisodes(days, [], TODAY)[0]!.meanAqi).toBe(50);
  });

  it("leaves a measure null rather than zero when it was never recorded", () => {
    const bare = unwellOn("2025-01-01");
    const ep = buildEpisodes(bare, [], TODAY)[0]!;
    expect(ep.peakColour).toBeNull();
    expect(ep.maxTemp).toBeNull();
    expect(ep.minPeakFlow).toBeNull();
    expect(ep.meanAqi).toBeNull();
  });

  it("ignores a measurement that cannot be read as a number", () => {
    const messy = makeDays({ "2025-01-01": { status: "unwell", temp: "thirty eight", peakFlow: "" } });
    const ep = buildEpisodes(messy, [], TODAY)[0]!;
    expect(ep.maxTemp).toBeNull();
    expect(ep.minPeakFlow).toBeNull();
  });
});

describe("courses attached to an episode", () => {
  const days = unwellOn("2025-01-05", "2025-01-06");

  it("includes a course that overlaps the episode at all", () => {
    const courses = [makeCourse({ id: "c1", startDate: d("2025-01-06"), days: 7 })];
    expect(buildEpisodes(days, courses, TODAY)[0]!.courses).toHaveLength(1);
  });

  it("includes a course that started before the episode and ran into it", () => {
    const courses = [makeCourse({ id: "c1", startDate: d("2025-01-01"), days: 7 })];
    expect(buildEpisodes(days, courses, TODAY)[0]!.courses).toHaveLength(1);
  });

  it("excludes a course that finished before it began", () => {
    const courses = [makeCourse({ id: "c1", startDate: d("2024-12-01"), days: 7 })];
    expect(buildEpisodes(days, courses, TODAY)[0]!.courses).toHaveLength(0);
  });

  it("treats an open-ended course as running up to today", () => {
    const courses = [makeCourse({ id: "c1", startDate: d("2025-01-01"), days: null })];
    expect(buildEpisodes(days, courses, TODAY)[0]!.courses).toHaveLength(1);
  });
});

describe("episodeDates", () => {
  it("covers every calendar day, including the ones not logged", () => {
    const ep = buildEpisodes(unwellOn("2025-01-01", "2025-01-04"), [], TODAY)[0]!;
    expect(episodeDates(ep)).toEqual(["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"]);
  });
});

describe("gapsBetween", () => {
  it("measures clear days from one episode ending to the next beginning", () => {
    const eps = buildEpisodes(unwellOn("2025-01-01", "2025-02-01", "2025-04-01"), [], TODAY);
    expect(gapsBetween(eps)).toEqual([31, 59]);
  });

  it("has no gaps for nothing, or for a single episode", () => {
    expect(gapsBetween([])).toEqual([]);
    expect(gapsBetween(buildEpisodes(unwellOn("2025-01-01"), [], TODAY))).toEqual([]);
  });
});

describe("wellRun", () => {
  it("counts days since the last episode ended", () => {
    const days = unwellOn("2025-06-01");
    const eps = buildEpisodes(days, [], TODAY);
    expect(wellRun(days, eps, TODAY).current).toBe(29);
  });

  it("is zero while today is marked unwell", () => {
    const days = { ...unwellOn("2025-06-01"), ...unwellOn(TODAY) };
    const eps = buildEpisodes(days, [], TODAY);
    expect(wellRun(days, eps, TODAY).current).toBe(0);
  });

  it("counts from the first entry when there has never been an episode", () => {
    const days = makeDays({ "2025-06-01": { status: "well" } });
    expect(wellRun(days, [], TODAY).current).toBe(30);
  });

  it("aims at thirty days before there is any history to beat", () => {
    const days = makeDays({ "2025-06-20": { status: "well" } });
    expect(wellRun(days, [], TODAY).target).toBe(30);
  });

  it("aims at the best gap on record once there is one", () => {
    const days = unwellOn("2025-01-01", "2025-03-01");
    const eps = buildEpisodes(days, [], TODAY);
    const run = wellRun(days, eps, TODAY);
    expect(run.best).toBe(59);
    expect(run.target).toBe(59);
  });

  it("says when the current run has beaten the best one", () => {
    const days = unwellOn("2025-01-01", "2025-01-20");
    const eps = buildEpisodes(days, [], TODAY);
    const run = wellRun(days, eps, TODAY);
    expect(run.best).toBe(19);
    expect(run.isBest).toBe(true);
  });

  it("does not open an empty log on a fully clouded sky", () => {
    const run = wellRun({}, [], TODAY);
    expect(run.noHistory).toBe(true);
    expect(run.clarity).toBeGreaterThan(0);
    expect(run.clarity).toBeLessThan(1);
  });

  it("caps clarity at one rather than running past it", () => {
    const days = unwellOn("2024-01-01");
    const eps = buildEpisodes(days, [], TODAY);
    expect(wellRun(days, eps, TODAY).clarity).toBe(1);
  });
});

describe("recoveryTrend", () => {
  it("says nothing with fewer than three episodes", () => {
    expect(recoveryTrend(buildEpisodes(unwellOn("2025-01-01", "2025-03-01"), [], TODAY))).toBeNull();
  });

  it("compares the earlier half with the later half", () => {
    const days = makeDays({
      "2024-01-01": { status: "unwell" },
      "2024-01-02": { status: "unwell" },
      "2024-01-03": { status: "unwell" },
      "2024-01-04": { status: "unwell" },
      "2024-01-05": { status: "unwell" },
      "2024-01-06": { status: "unwell" },
      "2024-03-01": { status: "unwell" },
      "2024-03-02": { status: "unwell" },
      "2024-05-01": { status: "unwell" },
    });
    const trend = recoveryTrend(buildEpisodes(days, [], TODAY))!;
    expect(trend.n).toBe(3);
    expect(trend.early).toBeGreaterThan(trend.late!);
  });
});

describe("seasonality", () => {
  it("counts episodes by calendar month and says how many years it pools", () => {
    const s = seasonality(buildEpisodes(unwellOn("2024-01-05", "2025-01-05", "2025-07-05"), [], TODAY));
    expect(s.byMonth[0]).toBe(2);
    expect(s.byMonth[6]).toBe(1);
    expect(s.years).toBe(2);
    expect(s.total).toBe(3);
  });

  it("reads the month from the date string rather than a parsed Date", () => {
    const s = seasonality(buildEpisodes(unwellOn("2025-12-31"), [], TODAY));
    expect(s.byMonth[11]).toBe(1);
  });

  it("handles no episodes", () => {
    expect(seasonality([])).toEqual({ byMonth: new Array(12).fill(0), years: 0, total: 0 });
  });
});

describe("episodesInYear", () => {
  it("picks the episodes that started in a year", () => {
    const eps = buildEpisodes(unwellOn("2024-12-31", "2025-01-15"), [], TODAY);
    expect(episodesInYear(eps, 2025).map((e) => e.start)).toEqual(["2025-01-15"]);
  });
});

describe("isOngoing", () => {
  it("treats an episode running up to yesterday as still open", () => {
    // Today may simply not be logged yet.
    const eps = buildEpisodes(unwellOn("2025-06-29"), [], TODAY);
    expect(isOngoing(eps[0]!, TODAY)).toBe(true);
  });

  it("treats one that ended earlier as finished", () => {
    const eps = buildEpisodes(unwellOn("2025-06-20"), [], TODAY);
    expect(isOngoing(eps[0]!, TODAY)).toBe(false);
  });
});
