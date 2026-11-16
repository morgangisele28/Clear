// The arithmetic under the screens. Everything Clear tells you — an episode's
// length, a drug's record, the paragraph for your team — is derived from daily
// entries by the functions tested here, and a wrong one is wrong quietly.
//
//   npm test
//
// The app is one JSX file that mounts itself when there is a page. Under Node
// there is none, so it is bundled as a module and its logic imported directly:
// these run against the same source the build ships, not a copy of it.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let C;

before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), "clear-test-")), "clear.mjs");
  await build({
    entryPoints: [resolve(root, "src/clear-app.jsx")],
    bundle: true,
    format: "esm",
    platform: "node",
    loader: { ".jsx": "jsx" },
    outfile: out,
    logLevel: "silent",
  });
  C = await import(pathToFileURL(out).href);
});

// a day with only what the test cares about filled in
const day = (patch = {}) => ({ ...C.emptyDay(), status: "well", ...patch });
const back = (n) => C.addDays(C.todayISO(), -n);

/* ---------------------------- dates ---------------------------- */

test("addDays and diffDays agree across a whole year, including clock changes", () => {
  const start = "2026-01-01";
  let d = start;
  for (let i = 0; i < 400; i++) {
    assert.equal(C.diffDays(start, d), i);
    const next = C.addDays(d, 1);
    assert.ok(next > d, `${next} should follow ${d}`);
    d = next;
  }
});

test("median of an even run rounds to a whole day", () => {
  assert.equal(C.median([]), null);
  assert.equal(C.median([5]), 5);
  assert.equal(C.median([3, 1, 2]), 2);
  assert.equal(C.median([1, 2, 3, 6]), 3);
});

/* -------------------------- migration -------------------------- */

test("migrate survives nothing, and an empty object", () => {
  assert.equal(C.migrate(null).v, 8);
  assert.deepEqual(C.migrate({}).days, {});
});

test("migrate is idempotent: a migrated log migrates to itself", () => {
  const once = C.migrate(JSON.parse(JSON.stringify(C.sampleYear())));
  const twice = C.migrate(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});

test("the old three-step blood field lands on the volume scale", () => {
  const s = C.migrate({
    v: 6,
    days: {
      "2025-03-01": { status: "unwell", blood: "streaks" },
      "2025-03-02": { status: "unwell", blood: "frank" },
      "2025-03-03": { status: "unwell", blood: "none" },
    },
  });
  assert.equal(s.days["2025-03-01"].blood, "specks");
  assert.equal(s.days["2025-03-01"].bloodLook, "streaks");
  assert.equal(s.days["2025-03-02"].blood, "teaspoon");
  assert.equal(s.days["2025-03-02"].bloodLook, "frank");
  assert.equal(s.days["2025-03-03"].blood, "none");
});

test("four-step sputum scales stretch onto seven, and only once", () => {
  const s = C.migrate({ v: 4, days: { "2025-03-01": { sputum: { color: 3, volume: 2, texture: 3 } } } });
  assert.deepEqual(s.days["2025-03-01"].sputum, { color: 3, volume: 4, texture: 6 });
  const again = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(again.days["2025-03-01"].sputum, { color: 3, volume: 4, texture: 6 });
});

test("a ticked plug becomes the tag rather than vanishing with the field", () => {
  const s = C.migrate({ v: 7, days: { "2025-03-01": { cast: true, tags: [] } } });
  assert.deepEqual(s.days["2025-03-01"].tags, ["Plug or cast"]);
  assert.equal("cast" in s.days["2025-03-01"], false);
  assert.ok(s.tags.includes("Plug or cast"));
});

test("a log with no condition chosen is scored on the bronchiectasis rule", () => {
  const s = C.migrate({ v: 3, days: {} });
  const d = day({ symptoms: { cough: 1, fatigue: 1, breathless: 1 } });
  const rules = C.exacerbationRules(d, s.conditions);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].key, "bronchiectasis");
  assert.equal(rules[0].met, true);
});

/* ------------------------- sample year ------------------------- */

test("every value in the sample year is one the current scales can name", () => {
  const s = C.sampleYear();
  const known = new Set(C.BLOOD.map((b) => b.v));
  for (const [k, d] of Object.entries(s.days)) {
    if (d.blood != null) assert.ok(known.has(d.blood), `${k} has retired blood value "${d.blood}"`);
    if (d.sputum.color != null) assert.ok(d.sputum.color >= 0 && d.sputum.color <= 7, k);
  }
});

/* ------------------------ exacerbations ------------------------ */

test("bronchiectasis counts three of six; two is not enough", () => {
  const two = day({ symptoms: { cough: 2, fatigue: 1 } });
  const three = day({ symptoms: { cough: 2, fatigue: 1, breathless: 1 } });
  assert.equal(C.exacerbationRules(two, ["bronchiectasis"])[0].met, false);
  const r = C.exacerbationRules(three, ["bronchiectasis"])[0];
  assert.equal(r.met, true);
  assert.deepEqual(r.list, ["cough", "breathlessness", "fatigue"]);
});

test("purulence starts at yellow, and haemoptysis counts whatever the amount", () => {
  const d = day({ sputum: { color: 4, volume: 2, texture: 3 }, blood: "specks", symptoms: { cough: 1 } });
  assert.deepEqual(C.exacerbationRules(d, ["bronchiectasis"])[0].list, ["cough", "purulence", "haemoptysis"]);
  const pale = day({ sputum: { color: 3, volume: 2, texture: 3 }, blood: "none" });
  assert.equal(C.exacerbationRules(pale, ["bronchiectasis"])[0].n, 0);
});

test("COPD is scored on its own rule, and both rules are reported separately", () => {
  const d = day({ symptoms: { breathless: 2 }, sputum: { color: 5, volume: 2, texture: 3 } });
  const both = C.exacerbationRules(d, ["bronchiectasis", "copd"]);
  const bx = both.find((r) => r.key === "bronchiectasis");
  const copd = both.find((r) => r.key === "copd");
  assert.equal(bx.met, false); // two of six
  assert.equal(copd.met, true); // two of three
  assert.equal(copd.of, 3);
});

/* --------------------------- episodes -------------------------- */

const unwellRun = (start, n, patch = {}) => {
  const out = {};
  for (let i = 0; i < n; i++) out[C.addDays(start, i)] = day({ status: "unwell", ...patch });
  return out;
};

test("unwell days a week apart are one episode; eight days apart are two", () => {
  const one = { ...unwellRun("2026-02-01", 2), ...unwellRun("2026-02-09", 1) };
  assert.equal(C.buildEpisodes(one, []).length, 1);
  assert.equal(C.buildEpisodes(one, [])[0].span, 9);
  const two = { ...unwellRun("2026-02-01", 2), ...unwellRun("2026-02-10", 1) };
  assert.equal(C.buildEpisodes(two, []).length, 2);
});

test("an episode picks up the courses that overlap it and no others", () => {
  const days = unwellRun("2026-02-10", 5);
  const eps = C.buildEpisodes(days, [
    { id: "a", drug: "Doxycycline", startDate: "2026-02-12", days: 7 },
    { id: "b", drug: "Amoxicillin", startDate: "2026-01-01", days: 7 },
  ]);
  assert.deepEqual(eps[0].meds.map((m) => m.id), ["a"]);
});

test("the write-up reports how much blood there was, not 'streaks only'", () => {
  const days = unwellRun("2026-02-10", 4);
  days["2026-02-11"].blood = "specks";
  days["2026-02-12"].blood = "teacup";
  days["2026-02-12"].bloodLook = "frank";
  const ep = C.buildEpisodes(days, [])[0];
  const text = C.episodeSummary(ep, days, []);
  assert.match(text, /blood in it on 2 days/);
  assert.match(text, /up to a teacup/);
  assert.match(text, /blood on its own/);
  assert.doesNotMatch(text, /streaks only/);
});

test("specks alone are still described as specks", () => {
  assert.equal(C.worstBlood([{ blood: "specks" }, { blood: "none" }]), "specks or streaks only");
});

/* ---------------------------- courses -------------------------- */

test("a free-text dose fills the pickers and loses nothing it cannot place", () => {
  assert.deepEqual(C.parseDose("500 mg twice daily"), { amount: "500", unit: "mg", freq: 2, freqText: "" });
  const odd = C.parseDose("500 mg d1, 250 mg d2–5");
  assert.equal(odd.freq, 0);
  assert.equal(odd.freqText, "d1, 250 mg d2–5");
});

test("adherence counts doses ticked against doses due, capped per day", () => {
  const start = back(4);
  const course = { id: "c1", startDate: start, days: 3, freq: 2 };
  const days = {
    [start]: day({ courseDoses: { c1: 2 } }),
    [C.addDays(start, 1)]: day({ courseDoses: { c1: 5 } }), // over-ticked: still two
    // third day not logged at all
  };
  assert.deepEqual(C.courseAdherence(course, days), { taken: 4, expected: 6 });
});

test("a course still running is only measured over the days that have happened", () => {
  const course = { id: "c1", startDate: back(1), days: 10, freq: 3 };
  assert.deepEqual(C.courseAdherence(course, {}), { taken: 0, expected: 6 });
});

test("response is read from the entries: eased on day 3, gone by day 5", () => {
  const start = back(20);
  const sev = [3, 3, 2, 2, 0, 0];
  const days = {};
  sev.forEach((v, i) => {
    days[C.addDays(start, i)] = day({ status: "unwell", symptoms: { cough: v }, symptomsReviewed: true });
  });
  const r = C.courseResponse({ id: "c", startDate: start, days: 6 }, days);
  assert.equal(r.symptoms[0].improvedDay, 3);
  assert.equal(r.symptoms[0].resolvedDay, 5);
});

/* -------------------------- early warning ---------------------- */

const sputumSeries = (colours, newestDaysAgo) => {
  const days = {};
  colours.forEach((c, i) => {
    days[back(newestDaysAgo + (colours.length - 1 - i))] = day({ sputum: { color: c, volume: 2, texture: 3 } });
  });
  return days;
};

test("a colour shift across the last three entries is flagged", () => {
  const w = C.earlyWarning(sputumSeries([1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4], 0), []);
  assert.ok(w.some((x) => x.key === "sputum-colour"));
});

test("the same shift a month old is not reported as happening now", () => {
  const w = C.earlyWarning(sputumSeries([1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4], 30), []);
  assert.equal(w.length, 0);
});

test("a steady log raises nothing", () => {
  assert.deepEqual(C.earlyWarning(sputumSeries(new Array(14).fill(1), 0), []), []);
});

/* ------------------------------ care --------------------------- */

const plan = [{ id: "neb", name: "Neb", target: 2, active: true }];

test("a day is complete when the plan is met; extra sessions do not overflow", () => {
  assert.equal(C.careComplete(day({ care: { neb: 1 } }), plan), false);
  assert.equal(C.careComplete(day({ care: { neb: 2 } }), plan), true);
  assert.equal(C.doseCount(day({ care: { neb: 9 } }), plan), 2);
});

test("a day keeps the plan it was scored against when the regimen changes later", () => {
  const d = day({ care: { neb: 1 }, plan: [{ id: "neb", name: "Neb", target: 1 }] });
  assert.equal(C.careComplete(d, plan), true);
});

test("the streak is not broken by a today that is not finished yet", () => {
  const days = {};
  for (let i = 1; i <= 3; i++) days[back(i)] = day({ care: { neb: 2 } });
  days[back(0)] = day({ care: { neb: 0 } });
  assert.equal(C.careRun(days, plan).current, 3);
  days[back(0)].care.neb = 2;
  assert.equal(C.careRun(days, plan).current, 4);
});

/* --------------------------- lead time -------------------------- */

test("lead time is the unbroken run of darker sputum straight before onset", () => {
  const onset = back(10);
  const days = {};
  for (let i = 40; i >= 1; i--) {
    // settled at 1, a blip at day -8, then dark for the last three days
    const c = i <= 3 ? 4 : i === 8 ? 4 : 1;
    days[C.addDays(onset, -i)] = day({ sputum: { color: c, volume: 2, texture: 3 } });
  }
  days[onset] = day({ status: "unwell" });
  const eps = C.buildEpisodes(days, []);
  const lt = C.leadTimes(days, eps, (d) => d.sputum.color, (v, b) => v > b);
  assert.deepEqual(lt, [{ start: onset, days: 3 }]);
});

/* ----------------------------- SpO2 ----------------------------- */

test("a usual saturation needs five well-day readings, and ignores unwell ones", () => {
  const days = {};
  [91, 92, 91, 90].forEach((v, i) => (days[back(i + 1)] = day({ spo2: String(v) })));
  assert.equal(C.spo2Usual(days), null);
  days[back(5)] = day({ spo2: "91" });
  days[back(6)] = day({ status: "unwell", spo2: "84" });
  assert.equal(C.spo2Usual(days), 91);
});

/* --------------------------- reminders -------------------------- */

test("calendar reminders are floating local times that repeat daily", () => {
  const ics = C.reminderIcs(["08:00", "20:30"], "Airway care");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:\d{8}T080000\r\n/); // no Z: 8am stays 8am
  assert.match(ics, /DTSTART:\d{8}T203000\r\n/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
});
