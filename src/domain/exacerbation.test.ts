import { describe, expect, it } from "vitest";
import { exacerbationRules } from "./exacerbation.ts";
import { makeDay } from "./testing.ts";
import type { ConditionKey } from "./types.ts";

const bx: ConditionKey[] = ["bronchiectasis"];
const copd: ConditionKey[] = ["copd"];

describe("which definitions get scored", () => {
  it("scores the bronchiectasis rule for bronchiectasis", () => {
    const rules = exacerbationRules(makeDay(), bx);
    expect(rules.map((r) => r.key)).toEqual(["bronchiectasis"]);
  });

  it("scores the Anthonisen rule for COPD", () => {
    const rules = exacerbationRules(makeDay(), copd);
    expect(rules.map((r) => r.key)).toEqual(["copd"]);
  });

  it("scores both, separately, when both conditions are set", () => {
    const rules = exacerbationRules(makeDay(), ["bronchiectasis", "copd"]);
    expect(rules.map((r) => r.key)).toEqual(["bronchiectasis", "copd"]);
  });

  it("scores cystic fibrosis on the same six features, not a rule of its own", () => {
    const rules = exacerbationRules(makeDay(), ["cf"]);
    expect(rules.map((r) => r.key)).toEqual(["bronchiectasis"]);
    expect(rules[0]!.of).toBe(6);
  });

  it("does not score the six features twice for bronchiectasis and CF together", () => {
    const rules = exacerbationRules(makeDay(), ["bronchiectasis", "cf"]);
    expect(rules).toHaveLength(1);
  });

  it("falls back to bronchiectasis for a log that predates the question", () => {
    expect(exacerbationRules(makeDay(), []).map((r) => r.key)).toEqual(["bronchiectasis"]);
    expect(exacerbationRules(makeDay(), undefined).map((r) => r.key)).toEqual(["bronchiectasis"]);
  });
});

describe("the six bronchiectasis features", () => {
  it("counts nothing on an empty day", () => {
    const r = exacerbationRules(makeDay(), bx)[0]!;
    expect(r.count).toBe(0);
    expect(r.present).toEqual([]);
    expect(r.met).toBe(false);
  });

  it("counts each of the six", () => {
    const day = makeDay({
      symptoms: { cough: 1, breathless: 1, fatigue: 1, sputumUp: 1 },
      sputum: { color: 6, volume: 5, texture: 4 },
      blood: "specks",
    });
    const r = exacerbationRules(day, bx)[0]!;
    expect(r.present).toEqual([
      "cough",
      "sputum volume",
      "purulence",
      "breathlessness",
      "fatigue",
      "haemoptysis",
    ]);
    expect(r.count).toBe(6);
    expect(r.met).toBe(true);
  });

  it("is met at three features and not at two", () => {
    const two = makeDay({ symptoms: { cough: 1, fatigue: 1 } });
    expect(exacerbationRules(two, bx)[0]!.met).toBe(false);

    const three = makeDay({ symptoms: { cough: 1, fatigue: 1, breathless: 1 } });
    expect(exacerbationRules(three, bx)[0]!.met).toBe(true);
  });
});

describe("purulence", () => {
  it("starts at yellow and not at pale yellow", () => {
    const pale = makeDay({ sputum: { color: 3, volume: null, texture: null } });
    expect(exacerbationRules(pale, bx)[0]!.present).not.toContain("purulence");

    const yellow = makeDay({ sputum: { color: 4, volume: null, texture: null } });
    expect(exacerbationRules(yellow, bx)[0]!.present).toContain("purulence");
  });

  it("does not count when no colour was recorded", () => {
    const r = exacerbationRules(makeDay({ sputum: { color: null, volume: null, texture: null } }), bx)[0]!;
    expect(r.present).not.toContain("purulence");
  });

  it("counts clear sputum as not purulent rather than as missing", () => {
    const clear = makeDay({ sputum: { color: 0, volume: null, texture: null } });
    expect(exacerbationRules(clear, bx)[0]!.present).not.toContain("purulence");
  });
});

describe("raised sputum volume", () => {
  it("counts when the symptom was ticked, whatever the volume", () => {
    const day = makeDay({ symptoms: { sputumUp: 1 }, sputum: { color: null, volume: 0, texture: null } });
    expect(exacerbationRules(day, bx)[0]!.present).toContain("sputum volume");
  });

  it("counts from a moderate recorded volume even when the symptom was not ticked", () => {
    const small = makeDay({ sputum: { color: null, volume: 3, texture: null } });
    expect(exacerbationRules(small, bx)[0]!.present).not.toContain("sputum volume");

    const moderate = makeDay({ sputum: { color: null, volume: 4, texture: null } });
    expect(exacerbationRules(moderate, bx)[0]!.present).toContain("sputum volume");
  });
});

describe("haemoptysis", () => {
  it("counts any blood at all", () => {
    for (const blood of ["specks", "teaspoon", "eggcup", "teacup", "more"] as const) {
      expect(exacerbationRules(makeDay({ blood }), bx)[0]!.present).toContain("haemoptysis");
    }
  });

  it("does not count an explicit none, nor an unanswered day", () => {
    expect(exacerbationRules(makeDay({ blood: "none" }), bx)[0]!.present).not.toContain("haemoptysis");
    expect(exacerbationRules(makeDay({ blood: null }), bx)[0]!.present).not.toContain("haemoptysis");
  });
});

describe("the three COPD criteria", () => {
  it("counts only breathlessness, volume and purulence", () => {
    const day = makeDay({
      symptoms: { cough: 3, fatigue: 3, breathless: 1 },
      blood: "teacup",
    });
    const r = exacerbationRules(day, copd)[0]!;
    // cough, fatigue and haemoptysis are not part of this definition
    expect(r.present).toEqual(["breathlessness"]);
    expect(r.of).toBe(3);
  });

  it("is met at two criteria and not at one", () => {
    const one = makeDay({ symptoms: { breathless: 1 } });
    expect(exacerbationRules(one, copd)[0]!.met).toBe(false);

    const two = makeDay({ symptoms: { breathless: 1 }, sputum: { color: 5, volume: null, texture: null } });
    expect(exacerbationRules(two, copd)[0]!.met).toBe(true);
  });
});

describe("the two definitions do not blend", () => {
  it("can be met on one rule and not the other on the same day", () => {
    // cough, fatigue and haemoptysis: three of the six, none of the three
    const day = makeDay({ symptoms: { cough: 2, fatigue: 2 }, blood: "specks" });
    const rules = exacerbationRules(day, ["bronchiectasis", "copd"]);
    expect(rules.find((r) => r.key === "bronchiectasis")!.met).toBe(true);
    expect(rules.find((r) => r.key === "copd")!.met).toBe(false);
  });
});

describe("severity does not change the count", () => {
  it("counts a mild symptom the same as a severe one", () => {
    const mild = makeDay({ symptoms: { cough: 1, fatigue: 1, breathless: 1 } });
    const severe = makeDay({ symptoms: { cough: 3, fatigue: 3, breathless: 3 } });
    expect(exacerbationRules(mild, bx)[0]!.count).toBe(exacerbationRules(severe, bx)[0]!.count);
  });
});
