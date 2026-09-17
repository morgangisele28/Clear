import { describe, expect, it } from "vitest";
import {
  adherencePercent,
  courseAdherence,
  courseEnd,
  courseOverlaps,
  courseResponse,
  courseRunsOn,
  drugHistory,
} from "./courses.ts";
import { makeCourse, makeDays } from "./testing.ts";
import type { IsoDate } from "./dates.ts";

const d = (s: string) => s as IsoDate;
const TODAY = d("2025-01-20");

describe("courseEnd", () => {
  it("is the last day of a fixed length course", () => {
    expect(courseEnd(makeCourse({ startDate: d("2025-01-01"), days: 7 }), TODAY)).toBe("2025-01-07");
  });

  it("is today while a course is still open-ended", () => {
    expect(courseEnd(makeCourse({ days: null }), TODAY)).toBe(TODAY);
  });

  it("treats a one day course as ending the day it started", () => {
    expect(courseEnd(makeCourse({ startDate: d("2025-01-01"), days: 1 }), TODAY)).toBe("2025-01-01");
  });
});

describe("courseRunsOn and courseOverlaps", () => {
  const course = makeCourse({ startDate: d("2025-01-05"), days: 7 }); // to the 11th

  it("includes both ends of the course", () => {
    expect(courseRunsOn(course, d("2025-01-05"), TODAY)).toBe(true);
    expect(courseRunsOn(course, d("2025-01-11"), TODAY)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(courseRunsOn(course, d("2025-01-04"), TODAY)).toBe(false);
    expect(courseRunsOn(course, d("2025-01-12"), TODAY)).toBe(false);
  });

  it("overlaps a span it touches at either edge", () => {
    expect(courseOverlaps(course, d("2025-01-01"), d("2025-01-05"), TODAY)).toBe(true);
    expect(courseOverlaps(course, d("2025-01-11"), d("2025-01-20"), TODAY)).toBe(true);
  });

  it("does not overlap a span it misses", () => {
    expect(courseOverlaps(course, d("2025-01-01"), d("2025-01-04"), TODAY)).toBe(false);
    expect(courseOverlaps(course, d("2025-01-12"), d("2025-01-20"), TODAY)).toBe(false);
  });
});

describe("courseAdherence", () => {
  const course = makeCourse({ id: "c1", startDate: d("2025-01-01"), days: 3, freq: 2 });

  it("counts doses ticked against doses expected", () => {
    const days = makeDays({
      "2025-01-01": { courseDoses: { c1: 2 } },
      "2025-01-02": { courseDoses: { c1: 1 } },
      "2025-01-03": { courseDoses: { c1: 2 } },
    });
    expect(courseAdherence(course, days, TODAY)).toEqual({ taken: 5, expected: 6 });
  });

  it("counts an unlogged day as a missed dose rather than skipping it", () => {
    const days = makeDays({ "2025-01-01": { courseDoses: { c1: 2 } } });
    expect(courseAdherence(course, days, TODAY)).toEqual({ taken: 2, expected: 6 });
  });

  it("does not count more doses than the course asks for in a day", () => {
    const days = makeDays({ "2025-01-01": { courseDoses: { c1: 9 } } });
    expect(courseAdherence(course, days, TODAY)!.taken).toBe(2);
  });

  it("only counts the part of the course that has happened", () => {
    // Two days in, a fourteen day course is not eighty per cent missed.
    const running = makeCourse({ id: "c1", startDate: d("2025-01-19"), days: 14, freq: 2 });
    const days = makeDays({ "2025-01-19": { courseDoses: { c1: 2 } }, "2025-01-20": { courseDoses: { c1: 2 } } });
    expect(courseAdherence(running, days, TODAY)).toEqual({ taken: 4, expected: 4 });
  });

  it("is null for a course with no daily frequency to count against", () => {
    // A tapering course has no single number of doses a day. Inventing one would
    // ask for the wrong number of ticks and then score against it.
    const taper = makeCourse({ freq: 0, days: 5 });
    expect(courseAdherence(taper, {}, TODAY)).toBeNull();
  });

  it("is null for an open-ended course", () => {
    expect(courseAdherence(makeCourse({ days: null }), {}, TODAY)).toBeNull();
  });

  it("is null for a course that has not started yet", () => {
    const future = makeCourse({ startDate: d("2025-02-01"), days: 7, freq: 2 });
    expect(courseAdherence(future, {}, TODAY)).toBeNull();
  });

  it("ignores doses recorded against a different course", () => {
    const days = makeDays({ "2025-01-01": { courseDoses: { other: 2 } } });
    expect(courseAdherence(course, days, TODAY)!.taken).toBe(0);
  });

  it("reads as a percentage", () => {
    const days = makeDays({
      "2025-01-01": { courseDoses: { c1: 2 } },
      "2025-01-02": { courseDoses: { c1: 2 } },
      "2025-01-03": { courseDoses: { c1: 2 } },
    });
    expect(adherencePercent(course, days, TODAY)).toBe(100);
    expect(adherencePercent(course, {}, TODAY)).toBe(0);
  });
});

describe("courseResponse", () => {
  const course = makeCourse({ id: "c1", startDate: d("2025-01-01"), days: 5, freq: 2 });

  it("reads the day each symptom first eased, counting the start day as day one", () => {
    const days = makeDays({
      "2025-01-01": { status: "unwell", symptoms: { cough: 3, fatigue: 2 }, symptomsReviewed: true },
      "2025-01-02": { status: "unwell", symptoms: { cough: 3, fatigue: 2 }, symptomsReviewed: true },
      "2025-01-03": { status: "unwell", symptoms: { cough: 2, fatigue: 2 }, symptomsReviewed: true },
      "2025-01-04": { status: "unwell", symptoms: { cough: 1, fatigue: 2 }, symptomsReviewed: true },
      "2025-01-05": { status: "unwell", symptoms: { cough: 0, fatigue: 2 }, symptomsReviewed: true },
    });
    const r = courseResponse(course, days, TODAY)!;
    const cough = r.symptoms.find((s) => s.key === "cough")!;
    expect(cough.improvedDay).toBe(3);
    expect(cough.resolvedDay).toBe(5);

    const fatigue = r.symptoms.find((s) => s.key === "fatigue")!;
    expect(fatigue.improvedDay).toBeNull();
    expect(fatigue.resolvedDay).toBeNull();
  });

  it("only tracks symptoms that were present at the start", () => {
    const days = makeDays({
      "2025-01-01": { status: "unwell", symptoms: { cough: 2, wheeze: 0 }, symptomsReviewed: true },
      "2025-01-02": { status: "unwell", symptoms: { cough: 2, wheeze: 3 }, symptomsReviewed: true },
    });
    expect(courseResponse(course, days, TODAY)!.symptoms.map((s) => s.key)).toEqual(["cough"]);
  });

  it("sorts the worst symptom first", () => {
    const days = makeDays({
      "2025-01-01": { status: "unwell", symptoms: { cough: 1, breathless: 3, fatigue: 2 }, symptomsReviewed: true },
    });
    expect(courseResponse(course, days, TODAY)!.symptoms.map((s) => s.key)).toEqual([
      "breathless",
      "fatigue",
      "cough",
    ]);
  });

  it("ignores a day whose symptom list was never actually answered", () => {
    // Marking a day unwell fills the list with zeros and flags it unreviewed.
    // Reading those zeros as improvement would say every course worked by day two.
    const days = makeDays({
      "2025-01-01": { status: "unwell", symptoms: { cough: 3 }, symptomsReviewed: true },
      "2025-01-02": { status: "unwell", symptoms: { cough: 0 }, symptomsReviewed: false },
      "2025-01-03": { status: "unwell", symptoms: { cough: 1 }, symptomsReviewed: true },
    });
    const cough = courseResponse(course, days, TODAY)!.symptoms[0]!;
    expect(cough.improvedDay).toBe(3);
    expect(cough.resolvedDay).toBeNull();
  });

  it("falls back to the last unwell day before the course when the start was not logged", () => {
    // People start antibiotics on bad days and do not always fill the app in.
    const days = makeDays({
      "2024-12-30": { status: "unwell", symptoms: { cough: 3 }, symptomsReviewed: true },
      "2025-01-03": { status: "unwell", symptoms: { cough: 1 }, symptomsReviewed: true },
    });
    const r = courseResponse(course, days, TODAY)!;
    expect(r.baselineDate).toBe("2024-12-30");
    expect(r.symptoms[0]!.improvedDay).toBe(3);
  });

  it("does not take a baseline from a well day", () => {
    // A baseline of no symptoms would make every course look like it worked.
    const days = makeDays({
      "2024-12-30": { status: "well", symptoms: {}, symptomsReviewed: true },
      "2025-01-03": { status: "unwell", symptoms: { cough: 2 }, symptomsReviewed: true },
    });
    const r = courseResponse(course, days, TODAY)!;
    expect(r.baselineDate).toBe("2025-01-03");
  });

  it("does not reach back indefinitely for a baseline", () => {
    const days = makeDays({
      "2024-12-01": { status: "unwell", symptoms: { cough: 3 }, symptomsReviewed: true },
      "2024-12-27": { status: "well" },
      "2024-12-28": { status: "well" },
      "2024-12-29": { status: "well" },
      "2024-12-30": { status: "well" },
      "2025-01-02": { status: "unwell", symptoms: { cough: 1 }, symptomsReviewed: true },
    });
    expect(courseResponse(course, days, TODAY)!.baselineDate).toBe("2025-01-02");
  });

  it("records where the sputum colour started and finished", () => {
    const days = makeDays({
      "2025-01-01": { status: "unwell", sputum: { color: 6, volume: null, texture: null } },
      "2025-01-04": { status: "unwell", sputum: { color: 2, volume: null, texture: null } },
    });
    const r = courseResponse(course, days, TODAY)!;
    expect(r.sputumStart).toBe(6);
    expect(r.sputumEnd).toBe(2);
  });

  it("counts logged days against the days of the course that have happened", () => {
    const days = makeDays({ "2025-01-01": { status: "unwell" }, "2025-01-03": { status: "unwell" } });
    const r = courseResponse(course, days, TODAY)!;
    expect(r.loggedDays).toBe(2);
    expect(r.windowDays).toBe(5);
  });

  it("stops the window at today for a course still running", () => {
    const running = makeCourse({ startDate: d("2025-01-19"), days: 14, freq: 2 });
    const days = makeDays({ "2025-01-19": { status: "unwell" } });
    expect(courseResponse(running, days, TODAY)!.windowDays).toBe(2);
  });

  it("is null when nothing across the course was ever logged", () => {
    expect(courseResponse(course, {}, TODAY)).toBeNull();
  });

  it("is null for a course that has not started", () => {
    const future = makeCourse({ startDate: d("2025-02-01"), days: 7 });
    expect(courseResponse(future, {}, TODAY)).toBeNull();
  });
});

describe("drugHistory", () => {
  const days = makeDays({
    "2025-01-01": { status: "unwell", symptoms: { cough: 3 }, symptomsReviewed: true, courseDoses: { a1: 2, b1: 2 } },
    "2025-01-02": { status: "unwell", symptoms: { cough: 3 }, symptomsReviewed: true, courseDoses: { a1: 2 } },
    "2025-01-03": { status: "unwell", symptoms: { cough: 1 }, symptomsReviewed: true, courseDoses: { a1: 2 } },
  });

  it("pools courses of the same drug", () => {
    const courses = [
      makeCourse({ id: "a1", drug: "Ciprofloxacin", startDate: d("2025-01-01"), days: 3, freq: 2 }),
      makeCourse({ id: "a2", drug: "Ciprofloxacin", startDate: d("2024-06-01"), days: 3, freq: 2 }),
      makeCourse({ id: "b1", drug: "Doxycycline", startDate: d("2025-01-01"), days: 3, freq: 2 }),
    ];
    const history = drugHistory(courses, days, TODAY);
    expect(history.map((h) => h.drug)).toEqual(["Ciprofloxacin", "Doxycycline"]);
    expect(history[0]!.n).toBe(2);
  });

  it("pools case and whitespace variants of the same name", () => {
    const courses = [
      makeCourse({ id: "a1", drug: "Ciprofloxacin" }),
      makeCourse({ id: "a2", drug: "  ciprofloxacin " }),
    ];
    expect(drugHistory(courses, days, TODAY)).toHaveLength(1);
  });

  it("reads the day symptoms eased out of the log, not from being asked", () => {
    const courses = [makeCourse({ id: "a1", drug: "Ciprofloxacin", startDate: d("2025-01-01"), days: 3, freq: 2 })];
    expect(drugHistory(courses, days, TODAY)[0]!.courses[0]!.easedDay).toBe(3);
  });

  it("puts doses actually taken next to the outcome", () => {
    // A drug that failed on sixty per cent of its doses has not really been tried.
    const courses = [
      makeCourse({ id: "b1", drug: "Doxycycline", startDate: d("2025-01-01"), days: 3, freq: 2, outcome: "failed" }),
    ];
    const entry = drugHistory(courses, days, TODAY)[0]!;
    expect(entry.courses[0]!.takenPercent).toBe(33);
    expect(entry.tally.failed).toBe(1);
  });

  it("counts outcomes and how many courses were rated at all", () => {
    const courses = [
      makeCourse({ id: "1", drug: "X", outcome: "resolved" }),
      makeCourse({ id: "2", drug: "X", outcome: "partial" }),
      makeCourse({ id: "3", drug: "X" }),
    ];
    const entry = drugHistory(courses, days, TODAY)[0]!;
    expect(entry.tally).toEqual({ resolved: 1, partial: 1, failed: 0 });
    expect(entry.rated).toBe(2);
    expect(entry.n).toBe(3);
  });

  it("orders by how many courses there are, then by the most recent", () => {
    const courses = [
      makeCourse({ id: "1", drug: "Older", startDate: d("2024-01-01") }),
      makeCourse({ id: "2", drug: "Newer", startDate: d("2025-01-01") }),
      makeCourse({ id: "3", drug: "Most", startDate: d("2023-01-01") }),
      makeCourse({ id: "4", drug: "Most", startDate: d("2023-02-01") }),
    ];
    expect(drugHistory(courses, days, TODAY).map((h) => h.drug)).toEqual(["Most", "Newer", "Older"]);
  });

  it("skips a course with no drug name", () => {
    expect(drugHistory([makeCourse({ drug: "" })], days, TODAY)).toEqual([]);
  });

  it("handles no courses at all", () => {
    expect(drugHistory([], days, TODAY)).toEqual([]);
    expect(drugHistory(undefined, days, TODAY)).toEqual([]);
  });

  it("collects the notes written about each course", () => {
    const courses = [
      makeCourse({ id: "1", drug: "X", outcomeNote: "made me sick" }),
      makeCourse({ id: "2", drug: "X" }),
    ];
    expect(drugHistory(courses, days, TODAY)[0]!.notes).toEqual(["made me sick"]);
  });
});
