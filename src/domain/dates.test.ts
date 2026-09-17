import { describe, expect, it } from "vitest";
import {
  addDays,
  datesBetween,
  diffDays,
  earliest,
  fromIso,
  isIsoDate,
  latest,
  toIso,
  todayIso,
  type IsoDate,
} from "./dates.ts";

const d = (s: string) => s as IsoDate;

describe("toIso", () => {
  it("reads the local calendar day, not the UTC one", () => {
    // 11pm local on the 5th is still the 5th, however far east or west the
    // machine running this happens to be.
    expect(toIso(new Date(2025, 2, 5, 23, 30))).toBe("2025-03-05");
    expect(toIso(new Date(2025, 2, 5, 0, 15))).toBe("2025-03-05");
  });

  it("pads single digit months and days", () => {
    expect(toIso(new Date(2025, 0, 1))).toBe("2025-01-01");
  });
});

describe("fromIso", () => {
  it("round trips through toIso", () => {
    expect(toIso(fromIso(d("2024-11-30")))).toBe("2024-11-30");
  });

  it("returns local midnight", () => {
    const x = fromIso(d("2024-11-30"));
    expect(x.getHours()).toBe(0);
    expect(x.getDate()).toBe(30);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays(d("2025-01-31"), 1)).toBe("2025-02-01");
    expect(addDays(d("2025-12-31"), 1)).toBe("2026-01-01");
    expect(addDays(d("2025-01-01"), -1)).toBe("2024-12-31");
  });

  it("handles a leap day", () => {
    expect(addDays(d("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(d("2025-02-28"), 1)).toBe("2025-03-01");
  });

  it("is the identity for zero", () => {
    expect(addDays(d("2025-06-15"), 0)).toBe("2025-06-15");
  });
});

describe("diffDays", () => {
  it("counts whole days in both directions", () => {
    expect(diffDays(d("2025-01-01"), d("2025-01-08"))).toBe(7);
    expect(diffDays(d("2025-01-08"), d("2025-01-01"))).toBe(-7);
    expect(diffDays(d("2025-01-01"), d("2025-01-01"))).toBe(0);
  });

  it("counts a daylight saving transition as one day", () => {
    // Spring forward in the UK and most of Europe, 2025-03-30: that local day is
    // 23 hours long. A diary still calls it one day.
    expect(diffDays(d("2025-03-29"), d("2025-03-30"))).toBe(1);
    // Autumn back, 2025-10-26: 25 hours long.
    expect(diffDays(d("2025-10-25"), d("2025-10-26"))).toBe(1);
  });

  it("agrees with addDays over a long span", () => {
    const start = d("2024-01-01");
    for (const n of [1, 29, 60, 180, 365, 400]) {
      expect(diffDays(start, addDays(start, n))).toBe(n);
    }
  });
});

describe("datesBetween", () => {
  it("is inclusive at both ends", () => {
    expect(datesBetween(d("2025-05-01"), d("2025-05-04"))).toEqual([
      "2025-05-01",
      "2025-05-02",
      "2025-05-03",
      "2025-05-04",
    ]);
  });

  it("returns a single day when both ends match", () => {
    expect(datesBetween(d("2025-05-01"), d("2025-05-01"))).toEqual(["2025-05-01"]);
  });

  it("returns nothing when the range is backwards", () => {
    expect(datesBetween(d("2025-05-04"), d("2025-05-01"))).toEqual([]);
  });
});

describe("string ordering", () => {
  it("sorts chronologically, which the rest of the domain relies on", () => {
    const sorted = ["2025-01-02", "2024-12-31", "2025-01-10", "2025-02-01"].sort();
    expect(sorted).toEqual(["2024-12-31", "2025-01-02", "2025-01-10", "2025-02-01"]);
  });
});

describe("earliest and latest", () => {
  it("pick the right end", () => {
    expect(earliest(d("2025-01-01"), d("2025-02-01"))).toBe("2025-01-01");
    expect(latest(d("2025-01-01"), d("2025-02-01"))).toBe("2025-02-01");
  });
});

describe("isIsoDate", () => {
  it("accepts a calendar day and rejects anything else", () => {
    expect(isIsoDate("2025-01-01")).toBe(true);
    expect(isIsoDate("2025-1-1")).toBe(false);
    expect(isIsoDate("2025-01-01T00:00:00Z")).toBe(false);
    expect(isIsoDate(20250101)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("todayIso", () => {
  it("takes an injected clock so nothing downstream needs to mock time", () => {
    expect(todayIso(new Date(2025, 6, 4, 13, 0))).toBe("2025-07-04");
  });
});
