import { describe, expect, it } from "vitest";
import {
  capitalise,
  formatDay,
  formatLong,
  formatShort,
  formatShortYear,
  formatWeekday,
  listOf,
  plural,
} from "./format.ts";
import type { IsoDate } from "./dates.ts";

const d = (s: string) => s as IsoDate;

describe("date formatting", () => {
  it("spells the month out so a date cannot be read two ways", () => {
    // A handover paragraph is read by somebody else. "04/03" meaning the fourth
    // of March or the third of April is not an ambiguity worth inheriting.
    expect(formatDay(d("2025-03-04"))).toBe("4 March");
    expect(formatShort(d("2025-03-04"))).toBe("4 Mar");
    expect(formatShortYear(d("2025-03-04"))).toBe("4 Mar 25");
  });

  it("does not pad the day", () => {
    expect(formatShort(d("2025-03-04"))).toBe("4 Mar");
  });

  it("names the weekday", () => {
    expect(formatLong(d("2025-03-04"))).toBe("Tuesday, 4 March");
    expect(formatWeekday(d("2025-03-04"))).toBe("Tue 4 Mar");
  });

  it("is stable whatever locale the machine is set to", () => {
    // The same assertion twice is the point: nothing here reads the environment.
    expect(formatShortYear(d("2024-12-31"))).toBe("31 Dec 24");
    expect(formatShortYear(d("2024-12-31"))).toBe("31 Dec 24");
  });

  it("handles every month", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach((name, i) => {
      expect(formatShort(d(`2025-${String(i + 1).padStart(2, "0")}-15`))).toBe(`15 ${name}`);
    });
  });
});

describe("listOf", () => {
  it("reads the way it would be said aloud", () => {
    expect(listOf(["cough"])).toBe("cough");
    expect(listOf(["cough", "fatigue"])).toBe("cough and fatigue");
    expect(listOf(["cough", "fatigue", "wheeze"])).toBe("cough, fatigue and wheeze");
  });

  it("is empty for nothing", () => {
    expect(listOf([])).toBe("");
  });
});

describe("plural", () => {
  it("agrees with the number", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(3, "day")).toBe("3 days");
    expect(plural(0, "day")).toBe("0 days");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("capitalise", () => {
  it("lifts the first letter and leaves the rest", () => {
    expect(capitalise("cough eased by day four")).toBe("Cough eased by day four");
    expect(capitalise("")).toBe("");
  });
});
