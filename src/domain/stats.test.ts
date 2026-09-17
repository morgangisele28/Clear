import { describe, expect, it } from "vitest";
import { mean, median } from "./stats.ts";

describe("median", () => {
  it("takes the middle of an odd length set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages and rounds the middle pair of an even length set", () => {
    // Every median here is a count of days, and half a day is not a thing.
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([1, 2, 2, 3])).toBe(2);
  });

  it("does not need its input sorted, and does not reorder it", () => {
    const input = [9, 1, 5];
    expect(median(input)).toBe(5);
    expect(input).toEqual([9, 1, 5]);
  });

  it("is null for nothing", () => {
    expect(median([])).toBeNull();
  });

  it("handles a single value", () => {
    expect(median([4])).toBe(4);
  });
});

describe("mean", () => {
  it("averages", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("is null for nothing", () => {
    expect(mean([])).toBeNull();
  });
});
