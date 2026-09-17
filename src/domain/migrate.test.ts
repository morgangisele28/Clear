import { describe, expect, it } from "vitest";
import { migrate } from "./migrate.ts";
import { SCHEMA_VERSION } from "./types.ts";

const TODAY = "2025-06-15";

/** Runs the chain the way a browser would: load, migrate, save, load again. */
const roundTrip = (raw: unknown, today = TODAY) =>
  migrate(JSON.parse(JSON.stringify(migrate(raw, today))), today);

describe("a log that is missing or unreadable", () => {
  it("gives an empty log rather than throwing", () => {
    for (const bad of [undefined, null, 0, "", [], "nonsense", true]) {
      const s = migrate(bad, TODAY);
      expect(s.v).toBe(SCHEMA_VERSION);
      expect(s.days).toEqual({});
      expect(s.courses).toEqual([]);
    }
  });

  it("survives collections stored as the wrong type", () => {
    const s = migrate({ v: 8, days: "corrupt", courses: 5, tags: null }, TODAY);
    expect(s.days).toEqual({});
    expect(s.courses).toEqual([]);
    expect(s.tags.length).toBeGreaterThan(0);
  });
});

describe("version stamping", () => {
  it("lands on the current version from any starting point", () => {
    for (const v of [undefined, 1, 4, 5, 6, 7, 8]) {
      expect(migrate({ v, days: {} }, TODAY).v).toBe(SCHEMA_VERSION);
    }
  });
});

describe("airway care moving from flags to counts", () => {
  it("turns a ticked flag into one session and an unticked one into none", () => {
    const s = migrate(
      { v: 1, days: { "2023-01-01": { status: "well", care: { saline: true, aerobika: false } } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.care).toMatchObject({ saline: 1, aerobika: 0 });
  });

  it("leaves a count that is already a count alone", () => {
    const s = migrate(
      { v: 8, days: { "2025-01-01": { status: "well", care: { saline: 2 } } } },
      TODAY,
    );
    expect(s.days["2025-01-01"]!.care["saline"]).toBe(2);
  });
});

describe("the mucolytic moving from two slots to a count", () => {
  it("adds the morning and evening slots together", () => {
    const s = migrate(
      { v: 1, days: { "2023-01-01": { care: { nacAm: true, nacPm: true } } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.care["nac"]).toBe(2);
  });

  it("counts one slot as one", () => {
    const s = migrate({ v: 1, days: { "2023-01-01": { care: { nacAm: true } } } }, TODAY);
    expect(s.days["2023-01-01"]!.care["nac"]).toBe(1);
  });

  it("drops the old slots once they have been read", () => {
    const s = migrate({ v: 1, days: { "2023-01-01": { care: { nacAm: true } } } }, TODAY);
    expect(s.days["2023-01-01"]!.care).not.toHaveProperty("nacAm");
    expect(s.days["2023-01-01"]!.care).not.toHaveProperty("nacPm");
  });

  it("does not overwrite a count that already exists", () => {
    const s = migrate(
      { v: 1, days: { "2023-01-01": { care: { nac: 2, nacAm: true } } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.care["nac"]).toBe(2);
  });
});

describe("the frozen plan", () => {
  it("gives a day from before plans were configurable the plan everyone shared", () => {
    const s = migrate({ v: 4, days: { "2023-01-01": { status: "well", care: {} } } }, TODAY);
    expect(s.days["2023-01-01"]!.plan).toEqual([
      { id: "saline", name: "Saline neb", target: 1 },
      { id: "aerobika", name: "Aerobika", target: 1 },
      { id: "nac", name: "NAC", target: 2 },
    ]);
  });

  it("reads the old maintenance inhaler field into the care count", () => {
    const s = migrate(
      { v: 4, days: { "2023-01-01": { care: {}, symbicort: true, symbicortTaken: 2 } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.care["symbicort"]).toBe(2);
  });

  it("does not invent a plan for a day recorded after plans became configurable", () => {
    // The original code did exactly this, with no version guard, which handed
    // treatments like Aerobika to people who have never used one.
    const s = migrate({ v: 8, days: { "2025-01-01": { status: "well", care: {} } } }, TODAY);
    expect(s.days["2025-01-01"]!.plan).toBeNull();
  });

  it("never overwrites a plan a day already carries", () => {
    const frozen = [{ id: "own", name: "My neb", target: 3 }];
    const s = migrate({ v: 4, days: { "2023-01-01": { care: {}, plan: frozen } } }, TODAY);
    expect(s.days["2023-01-01"]!.plan).toEqual(frozen);
  });

  it("drops only today's frozen plan when coming from before version 6", () => {
    const s = migrate(
      {
        v: 5,
        days: {
          [TODAY]: { care: { x: 1 }, plan: [{ id: "x", name: "X", target: 1 }] },
          "2025-06-01": { care: { x: 1 }, plan: [{ id: "x", name: "X", target: 1 }] },
        },
      },
      TODAY,
    );
    expect(s.days[TODAY]!.plan).toBeNull();
    expect(s.days["2025-06-01"]!.plan).toHaveLength(1);
  });

  it("leaves today's plan alone when coming from version 6 or later", () => {
    const s = migrate(
      { v: 6, days: { [TODAY]: { care: {}, plan: [{ id: "x", name: "X", target: 1 }] } } },
      TODAY,
    );
    expect(s.days[TODAY]!.plan).toHaveLength(1);
  });
});

describe("the sputum scales widening from four steps to seven", () => {
  it("keeps the relative position of a reading", () => {
    const s = migrate(
      { v: 4, days: { "2023-01-01": { sputum: { color: 3, volume: 2, texture: 1 } } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.sputum).toMatchObject({ volume: 4, texture: 2 });
  });

  it("leaves the colour scale untouched, which did not change", () => {
    const s = migrate({ v: 4, days: { "2023-01-01": { sputum: { color: 3 } } } }, TODAY);
    expect(s.days["2023-01-01"]!.sputum.color).toBe(3);
  });

  it("caps at the top of the new scale", () => {
    const s = migrate({ v: 4, days: { "2023-01-01": { sputum: { volume: 6 } } } }, TODAY);
    expect(s.days["2023-01-01"]!.sputum.volume).toBe(6);
  });

  it("leaves an unrecorded reading unrecorded rather than making it a zero", () => {
    const s = migrate({ v: 4, days: { "2023-01-01": { sputum: {} } } }, TODAY);
    expect(s.days["2023-01-01"]!.sputum).toEqual({ color: null, volume: null, texture: null });
  });

  it("does not widen a reading already on the seven step scale", () => {
    const s = migrate({ v: 5, days: { "2023-01-01": { sputum: { volume: 2 } } } }, TODAY);
    expect(s.days["2023-01-01"]!.sputum.volume).toBe(2);
  });
});

describe("haemoptysis splitting into volume and appearance", () => {
  it("carries streaks over exactly", () => {
    const s = migrate({ v: 6, days: { "2023-01-01": { blood: "streaks" } } }, TODAY);
    expect(s.days["2023-01-01"]!.blood).toBe("specks");
    expect(s.days["2023-01-01"]!.bloodLook).toBe("streaks");
  });

  it("puts frank blood on the smallest band above streaking, keeping the description", () => {
    const s = migrate({ v: 6, days: { "2023-01-01": { blood: "frank" } } }, TODAY);
    expect(s.days["2023-01-01"]!.blood).toBe("teaspoon");
    expect(s.days["2023-01-01"]!.bloodLook).toBe("frank");
  });

  it("leaves an explicit none, and an unanswered day, alone", () => {
    const s = migrate(
      { v: 6, days: { a: { blood: "none" }, b: { blood: null }, c: {} } },
      TODAY,
    );
    expect(s.days["a"]!.blood).toBe("none");
    expect(s.days["b"]!.blood).toBeNull();
    expect(s.days["c"]!.blood).toBeNull();
  });

  it("does not re-translate a log already on the volume scale", () => {
    const s = migrate({ v: 7, days: { "2023-01-01": { blood: "teacup" } } }, TODAY);
    expect(s.days["2023-01-01"]!.blood).toBe("teacup");
  });
});

describe("the plug toggle becoming a tag", () => {
  it("turns a ticked plug into the tag", () => {
    const s = migrate({ v: 7, days: { "2023-01-01": { cast: true, tags: [] } } }, TODAY);
    expect(s.days["2023-01-01"]!.tags).toContain("Plug or cast");
    expect(s.tags).toContain("Plug or cast");
  });

  it("does not tag a day where it was never ticked", () => {
    const s = migrate({ v: 7, days: { "2023-01-01": { cast: false, tags: [] } } }, TODAY);
    expect(s.days["2023-01-01"]!.tags).not.toContain("Plug or cast");
  });

  it("drops the field once it has been read", () => {
    const s = migrate({ v: 7, days: { "2023-01-01": { cast: true } } }, TODAY);
    expect(s.days["2023-01-01"]).not.toHaveProperty("cast");
  });

  it("does not duplicate a tag that is already there", () => {
    const s = migrate(
      { v: 7, tags: ["Plug or cast"], days: { "2023-01-01": { cast: true, tags: ["Plug or cast"] } } },
      TODAY,
    );
    expect(s.tags.filter((t) => t === "Plug or cast")).toHaveLength(1);
    expect(s.days["2023-01-01"]!.tags.filter((t) => t === "Plug or cast")).toHaveLength(1);
  });
});

describe("the free-text trigger becoming tags", () => {
  it("moves it onto the day and into the tag list", () => {
    const s = migrate({ v: 1, days: { "2023-01-01": { trigger: "Dusty loft" } } }, TODAY);
    expect(s.days["2023-01-01"]!.tags).toContain("Dusty loft");
    expect(s.tags).toContain("Dusty loft");
    expect(s.days["2023-01-01"]).not.toHaveProperty("trigger");
  });

  it("ignores an empty trigger", () => {
    const s = migrate({ v: 1, days: { "2023-01-01": { trigger: "" } } }, TODAY);
    expect(s.days["2023-01-01"]!.tags).toEqual([]);
  });
});

describe("courses gaining structured dose fields", () => {
  const old = {
    v: 6,
    courses: [{ id: "c1", drug: "Ciprofloxacin", dose: "500 mg twice daily", startDate: "2024-01-01", days: 14 }],
  };

  it("reads the written dose into the pickers", () => {
    const c = migrate(old, TODAY).courses[0]!;
    expect(c).toMatchObject({ amount: "500", unit: "mg", freq: 2 });
  });

  it("never rewrites the dose string itself", () => {
    // This string is what the handover paragraph and the CSV print. Rewording
    // somebody's own record behind their back is not a migration.
    expect(migrate(old, TODAY).courses[0]!.dose).toBe("500 mg twice daily");
  });

  it("keeps an unparseable dose verbatim and asks for nothing", () => {
    const s = migrate(
      { v: 6, courses: [{ id: "c1", drug: "X", dose: "as directed", startDate: "2024-01-01", days: 7 }] },
      TODAY,
    );
    expect(s.courses[0]!.dose).toBe("as directed");
    expect(s.courses[0]!.freq).toBe(0);
    expect(s.courses[0]!.freqText).toBe("as directed");
  });

  it("leaves a course that already has structured fields alone", () => {
    const s = migrate(
      {
        v: 8,
        courses: [
          { id: "c1", drug: "X", dose: "anything", amount: "250", unit: "mg", freq: 3, freqText: "", startDate: "2024-01-01", days: 7 },
        ],
      },
      TODAY,
    );
    expect(s.courses[0]!).toMatchObject({ amount: "250", freq: 3 });
  });
});

describe("conditions", () => {
  it("scores a log that predates the question on the bronchiectasis rule", () => {
    expect(migrate({ v: 5, days: {} }, TODAY).conditions).toEqual(["bronchiectasis"]);
  });

  it("keeps whatever was chosen", () => {
    expect(migrate({ v: 8, conditions: ["copd"] }, TODAY).conditions).toEqual(["copd"]);
  });

  it("respects a deliberately empty choice rather than filling it back in", () => {
    expect(migrate({ v: 8, conditions: [] }, TODAY).conditions).toEqual([]);
  });
});

describe("what a migration must never do", () => {
  it("carries unknown fields through untouched", () => {
    // A log written by a newer build and opened by an older one must not be
    // stripped of the fields the older build does not recognise.
    const s = migrate({ v: 8, somethingNew: { nested: 1 }, days: {} }, TODAY) as unknown as Record<string, unknown>;
    expect(s["somethingNew"]).toEqual({ nested: 1 });
  });

  it("keeps a day's own text exactly as written", () => {
    const s = migrate(
      { v: 1, days: { "2023-01-01": { notes: "  felt rough, GP at 4pm  ", organism: "Pseudomonas aeruginosa" } } },
      TODAY,
    );
    expect(s.days["2023-01-01"]!.notes).toBe("  felt rough, GP at 4pm  ");
    expect(s.days["2023-01-01"]!.organism).toBe("Pseudomonas aeruginosa");
  });

  it("does not lose a day", () => {
    const days: Record<string, unknown> = {};
    for (let i = 1; i <= 40; i++) days[`2023-01-${String(i).padStart(2, "0")}`] = { status: "well" };
    const s = migrate({ v: 1, days }, TODAY);
    expect(Object.keys(s.days)).toHaveLength(40);
  });

  it("does not turn an unanswered symptom list into an answered one", () => {
    const s = migrate({ v: 8, days: { "2025-01-01": { status: "unwell", symptomsReviewed: false } } }, TODAY);
    expect(s.days["2025-01-01"]!.symptomsReviewed).toBe(false);
  });
});

describe("idempotency", () => {
  const messy = {
    v: 1,
    days: {
      "2023-01-01": {
        status: "unwell",
        care: { saline: true, aerobika: false, nacAm: true, nacPm: true },
        sputum: { color: 5, volume: 2, texture: 3 },
        blood: "frank",
        cast: true,
        trigger: "Damp flat",
        notes: "day one",
      },
      [TODAY]: { status: "well", care: { saline: true }, plan: [{ id: "saline", name: "Saline neb", target: 1 }] },
    },
    courses: [{ id: "c1", drug: "Doxycycline", dose: "100 mg twice daily", startDate: "2023-01-02", days: 7 }],
  };

  it("gives the same result run twice as run once", () => {
    // A half-saved upgrade will do exactly this on the next load.
    const once = migrate(messy, TODAY);
    const twice = roundTrip(messy);
    expect(twice).toEqual(once);
  });

  it("is stable across a third pass", () => {
    const twice = roundTrip(messy);
    expect(migrate(JSON.parse(JSON.stringify(twice)), TODAY)).toEqual(twice);
  });
});

describe("a full version 1 log", () => {
  it("arrives intact and fully translated", () => {
    const s = migrate(
      {
        v: 1,
        days: {
          "2022-03-04": {
            status: "unwell",
            care: { saline: true, aerobika: true, nacAm: true, nacPm: false },
            sputum: { color: 6, volume: 3, texture: 2 },
            blood: "streaks",
            symptoms: { cough: 2, breathless: 1 },
            temp: "38.1",
            peakFlow: "310",
            trigger: "Household illness",
            cast: true,
            notes: "started overnight",
          },
        },
        courses: [{ id: "c1", drug: "Amoxicillin/clavulanate", dose: "875/125 mg twice daily", startDate: "2022-03-04", days: 7 }],
      },
      TODAY,
    );

    const day = s.days["2022-03-04"]!;
    expect(day.care).toMatchObject({ saline: 1, aerobika: 1, nac: 1 });
    expect(day.sputum).toEqual({ color: 6, volume: 6, texture: 4 });
    expect(day.blood).toBe("specks");
    expect(day.bloodLook).toBe("streaks");
    expect(day.tags).toEqual(expect.arrayContaining(["Household illness", "Plug or cast"]));
    expect(day.symptoms).toEqual({ cough: 2, breathless: 1 });
    expect(day.temp).toBe("38.1");
    expect(day.peakFlow).toBe("310");
    expect(day.notes).toBe("started overnight");
    expect(day.plan).toHaveLength(3);
    expect(s.courses[0]).toMatchObject({ amount: "875/125", unit: "mg", freq: 2 });
    expect(s.v).toBe(SCHEMA_VERSION);
  });
});
