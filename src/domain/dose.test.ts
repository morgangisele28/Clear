import { describe, expect, it } from "vitest";
import { doseText, parseDose } from "./dose.ts";

describe("parseDose", () => {
  it("reads an amount, a unit and a frequency", () => {
    expect(parseDose("500 mg twice daily")).toEqual({
      amount: "500",
      unit: "mg",
      freq: 2,
      freqText: "",
    });
  });

  it("reads each daily frequency", () => {
    expect(parseDose("100 mg once daily").freq).toBe(1);
    expect(parseDose("100 mg twice daily").freq).toBe(2);
    expect(parseDose("100 mg three times daily").freq).toBe(3);
    expect(parseDose("100 mg four times daily").freq).toBe(4);
  });

  it("reads the abbreviations a prescription is actually written in", () => {
    expect(parseDose("500mg bd").freq).toBe(2);
    expect(parseDose("500mg bid").freq).toBe(2);
    expect(parseDose("500mg tds").freq).toBe(3);
    expect(parseDose("500mg tid").freq).toBe(3);
    expect(parseDose("500mg qds").freq).toBe(4);
    expect(parseDose("500mg qid").freq).toBe(4);
    expect(parseDose("500mg od").freq).toBe(1);
  });

  it("does not need a space between amount and unit", () => {
    expect(parseDose("500mg bd")).toMatchObject({ amount: "500", unit: "mg" });
  });

  it("normalises the unit to lower case", () => {
    expect(parseDose("500 MG daily").unit).toBe("mg");
  });

  it("reads every unit the picker offers", () => {
    for (const unit of ["mg", "mcg", "g", "ml", "units", "puffs", "tablets", "capsules"]) {
      expect(parseDose(`2 ${unit} daily`).unit).toBe(unit);
    }
  });

  it("reads a singular unit too", () => {
    expect(parseDose("1 tablet daily").unit).toBe("tablet");
    expect(parseDose("1 puff twice daily").unit).toBe("puff");
  });

  it("keeps a decimal or fractional amount", () => {
    expect(parseDose("4.5 g daily").amount).toBe("4.5");
    expect(parseDose("1/2 tablet daily").amount).toBe("1/2");
  });

  it("keeps what it cannot place, rather than dropping it", () => {
    const r = parseDose("500 mg every other day");
    expect(r.amount).toBe("500");
    expect(r.unit).toBe("mg");
    expect(r.freq).toBe(0);
    expect(r.freqText).toBe("every other day");
  });

  it("keeps the whole string when there is no amount to read", () => {
    expect(parseDose("as directed by the clinic")).toEqual({
      amount: "",
      unit: "",
      freq: 0,
      freqText: "as directed by the clinic",
    });
  });

  it("handles an empty or missing dose", () => {
    const blank = { amount: "", unit: "", freq: 0, freqText: "" };
    expect(parseDose("")).toEqual(blank);
    expect(parseDose(null)).toEqual(blank);
    expect(parseDose(undefined)).toEqual(blank);
    expect(parseDose("   ")).toEqual(blank);
  });

  it("does not read a tapering dose as a frequency it cannot honour", () => {
    // The real Z-Pak suggestion. It has no single daily frequency, and claiming
    // one would make the dose counter ask for the wrong number of ticks.
    const r = parseDose("500 mg d1, 250 mg d2–5");
    expect(r.amount).toBe("500");
    expect(r.freq).toBe(0);
    expect(r.freqText).toBe("d1, 250 mg d2–5");
  });

  it("reads a frequency written as a multiplier", () => {
    expect(parseDose("2 x daily").freq).toBe(2);
    expect(parseDose("3 x daily").freq).toBe(3);
  });
});

describe("doseText", () => {
  it("writes the phrase back out", () => {
    expect(doseText({ amount: "500", unit: "mg", freq: 2, freqText: "" })).toBe("500 mg twice daily");
  });

  it("writes each daily frequency in words", () => {
    const at = (freq: number) => doseText({ amount: "1", unit: "tablet", freq, freqText: "" });
    expect(at(1)).toBe("1 tablet once daily");
    expect(at(2)).toBe("1 tablet twice daily");
    expect(at(3)).toBe("1 tablet three times daily");
    expect(at(4)).toBe("1 tablet four times daily");
  });

  it("falls back to the free text frequency", () => {
    expect(doseText({ amount: "500", unit: "mg", freq: 0, freqText: "every other day" })).toBe(
      "500 mg every other day",
    );
  });

  it("omits an empty amount or an empty frequency", () => {
    expect(doseText({ amount: "", unit: "mg", freq: 2, freqText: "" })).toBe("twice daily");
    expect(doseText({ amount: "500", unit: "mg", freq: 0, freqText: "" })).toBe("500 mg");
    expect(doseText({ amount: "", unit: "", freq: 0, freqText: "" })).toBe("");
  });

  it("writes an amount with no unit", () => {
    expect(doseText({ amount: "2", unit: "", freq: 1, freqText: "" })).toBe("2 once daily");
  });

  it("handles a missing fields object", () => {
    expect(doseText(null)).toBe("");
    expect(doseText(undefined)).toBe("");
  });

  it("round trips a dose it can fully read", () => {
    for (const text of ["500 mg twice daily", "250 mg once daily", "4.5 g four times daily"]) {
      expect(doseText(parseDose(text))).toBe(text);
    }
  });
});
