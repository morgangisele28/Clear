// Regenerate the store panels in screenshots/ from the built app.
//
//   npm i --no-save playwright
//   node build/screenshots.mjs
//
// Nothing here is drawn by hand. The script serves the real index.html, loads the
// built-in sample year, walks to a day inside its most recent episode so the cards
// hold actual readings rather than empty state, screenshots the individual cards,
// then composes each panel around one. Editing the copy below is enough to change a
// panel; the pictures come from whatever the app currently does.

import { createServer } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { dirname, resolve, extname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "screenshots");
const CARDS = join(tmpdir(), "clear-shots");
const PORT = 8137;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed. Run:  npm i --no-save playwright");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  The panels. Copy lives here; the screenshots are captured below.    */
/* ------------------------------------------------------------------ */

const PANELS = [
  {
    file: "clear-store-01-what",
    eyebrow: "The log I wanted and could not find",
    head: "Remember what\nhappened last time",
    sub: "How long were you ill? What did they prescribe, and did it work? What was your sputum doing on day three? One place that holds the answer.",
    imgs: ["hero.png"],
    bleed: true,
  },
  {
    file: "clear-store-02-care",
    eyebrow: "Twenty seconds a day",
    head: "Your care plan,\nnot someone else's",
    sub: "Set what a full day means for you. Neb, Aerobika, NAC, inhaler, anything. The ring counts doses, and grows when your plan does.",
    imgs: ["care.png"],
  },
  {
    file: "clear-store-02b-conditions",
    eyebrow: "Bronchiectasis · CF · COPD",
    head: "Built for what\nyou actually have",
    sub: "Each condition counts an exacerbation differently, so pick yours and it scores that rule. Pick more than one — they often come together — and you get each count separately, never blended into something wrong for both.",
    imgs: ["conditions.png"],
  },
  {
    file: "clear-store-03-doses",
    eyebrow: "While you are on a course",
    head: "Antibiotics,\nrecorded properly",
    sub: "Dose, how often, and any special instruction. Tick each one off in your care card as you take it, and a finished course reports how many you actually managed.",
    imgs: ["courses.png"],
  },
  {
    file: "clear-store-04-sputum",
    eyebrow: "Fixed scales, on purpose",
    head: "Match it on a\nscale that holds",
    sub: "Colour, volume and thickness on scales that do not drift, so a reading in July is still comparable next February. It flags a shift against your own baseline.",
    imgs: ["sputum.png"],
  },
  {
    file: "clear-store-05-exacerbation",
    eyebrow: "Three or more of six",
    head: "It knows what an\nexacerbation is",
    sub: "You are already recording all six features, so the app counts them and names which are present. A count of what you logged, not a diagnosis.",
    imgs: ["exac.png", "symptoms.png"],
  },
  {
    file: "clear-store-06-episodes",
    eyebrow: "It keeps its own record",
    head: "Every illness,\non the record",
    sub: "Mark a day unwell and an episode opens; it closes after a clear week. Duration, the gap since the last one, cultures grown, what you took and whether it worked.",
    imgs: ["episode.png"],
  },
  {
    file: "clear-store-07-handover",
    eyebrow: "Arithmetic, not a language model",
    head: "A write-up\nfor your team",
    sub: "A paragraph you can paste straight into a message, read out of your own day-by-day entries. It changes what you get prescribed, so nothing in it is invented.",
    imgs: ["handover.png"],
  },
  {
    file: "clear-store-07b-together",
    eyebrow: "Your own overlay",
    head: "See what moves\nwith what",
    sub: "Every measure you keep, on one date axis, with your episodes shaded through the stack and your antibiotic courses underneath. No correlation figure attached to it — with this many measures, coincidence would look like a finding. It shows you the picture and lets you decide.",
    imgs: ["timeline.png"],
  },
  {
    file: "clear-store-08-patterns",
    eyebrow: "The numbers that matter",
    head: "Longer gaps.\nFewer episodes.",
    sub: "Days between episodes, this year against last, peak flow read against your own personal best rather than population averages.",
    imgs: ["gaps.png", "yoy.png"],
  },
  {
    file: "clear-store-08b-yours",
    eyebrow: "It fits round you",
    head: "Only the things\nyou actually measure",
    sub: "No peak flow meter? Switch it off and the field goes, along with the reminder to use it. Set the times you mean to do your care and put them in your own calendar, so something nudges you on the days you feel fine.",
    // reminders first: it is the short card, so it lands whole and the long
    // list of measurements bleeds off the bottom edge behind it
    imgs: ["remind.png", "track.png"],
  },
  {
    file: "clear-store-09-private",
    eyebrow: "No account, no server, no tracking",
    head: "It never leaves\nyour phone",
    sub: "Stored on your device only. Back it up to a file you keep. Add it to your home screen and it works offline.",
    imgs: ["screen-report.png"],
    dark: true,
    frame: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Serve the real app                                                 */
/* ------------------------------------------------------------------ */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = resolve(root, "." + (url === "/" ? "/index.html" : url));
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));
const BASE = "http://127.0.0.1:" + PORT + "/index.html?sample=1";

/* ------------------------------------------------------------------ */
/*  Capture                                                            */
/* ------------------------------------------------------------------ */

rmSync(CARDS, { recursive: true, force: true });
mkdirSync(CARDS, { recursive: true });
mkdirSync(OUT, { recursive: true });

// CI images ship a chromium at a known path; everywhere else let playwright find its own
const preinstalled = "/opt/pw-browsers/chromium";
const launch = existsSync(preinstalled) ? { executablePath: preinstalled } : {};
const browser = await chromium.launch(launch);

const shotCtx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await shotCtx.newPage();
page.on("dialog", (d) => d.accept());
page.on("pageerror", (e) => console.error("  page error: " + e.message));

await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(1800);

// The intro, and later a milestone card, sit over a scrim that swallows every click.
const clearOverlays = async () => {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => !!document.querySelector(".scrim, .modal, .milestone")))) return;
    await page.evaluate(() => {
      const x = document.querySelector(".modal-x");
      if (x) return x.click();
      const b = document.querySelector(".milestone button, .modal button");
      if (b) return b.click();
      const s = document.querySelector(".scrim");
      if (s) s.click();
    });
    await page.waitForTimeout(400);
  }
};

const click = async (re) => {
  await clearOverlays();
  return page.evaluate((r) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(r, "i").test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  }, re);
};

const setValue = (el, v) => {
  const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
  set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

// Same as card(), minus the overlay sweep: used for cards that only exist while
// a sheet is open, where clearing overlays would shut the thing being shot.
const cardIn = async (needle, file, sel = ".card") => {
  const loc = page.locator(sel).filter({ hasText: needle });
  if (!(await loc.count())) {
    console.error("  missing: " + file + " (" + needle + ")");
    return;
  }
  await loc.first().screenshot({ path: join(CARDS, file + ".png") });
  console.log("  captured " + file);
};

const clickIn = (re) =>
  page.evaluate((r) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(r, "i").test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  }, re);

const card = async (needle, file, sel = ".card") => {
  await clearOverlays();
  const loc = page.locator(sel).filter({ hasText: needle });
  if (!(await loc.count())) {
    console.error("  missing: " + file + " (" + needle + ")");
    return;
  }
  await loc.first().screenshot({ path: join(CARDS, file + ".png") });
  console.log("  captured " + file);
};

// the sample year comes from ?sample=1 on the URL above; the button that used to
// load it has no place in an app people keep their own health record in
await clearOverlays();
await page.waitForTimeout(1200);

// Walk to a day inside the most recent episode, where the cards are actually full.
const target = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("bxlog-v1"));
  const ill = Object.keys(st.days).filter((k) => st.days[k].status === "unwell").sort();
  const run = [];
  for (let i = ill.length - 1; i >= 0; i--) {
    const prev = run.length ? new Date(run[0]) : null;
    if (!prev || (prev - new Date(ill[i])) / 86400000 <= 2) run.unshift(ill[i]);
    else break;
  }
  return run[Math.floor(run.length * 0.4)] || ill[ill.length - 1];
});
console.log("  sample episode day: " + target);

await page.evaluate(() => {
  const b = [...document.querySelectorAll(".monthbtn")].find((x) => /Month/.test(x.textContent));
  if (b) b.click();
});
await page.waitForTimeout(700);
for (let i = 0; i < 18; i++) {
  const state = await page.evaluate((iso) => {
    const head = document.querySelector(".calwrap .cal-head .m");
    if (!head) return "gone";
    const want = new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (head.textContent.trim() === want) return "here";
    const back = document.querySelector(".calwrap .cal-head button");
    if (back) back.click();
    return "moving";
  }, target);
  if (state !== "moving") break;
  await page.waitForTimeout(260);
}
await page.evaluate((iso) => {
  const n = String(Number(iso.slice(8, 10)));
  const cell = [...document.querySelectorAll(".calwrap .cal-cell")].find((c) => c.textContent.trim() === n);
  if (cell) cell.click();
}, target);
await page.waitForTimeout(1200);
await clearOverlays();

// Half-fill today's antibiotic so it reads mid-course rather than untouched. The
// pill wraps back to zero once it is full, so click round until it lands on one.
for (let i = 0; i < 4; i++) {
  const done = await page.evaluate(() => {
    const c = [...document.querySelectorAll(".card")].find((x) => /Today's care/.test(x.textContent));
    if (!c) return true;
    const rows = [...c.querySelectorAll(".dosepill")];
    const p = rows[rows.length - 1];
    if (!p) return true;
    if (/^1 of /.test(p.querySelector(".val")?.textContent || "")) return true;
    p.click();
    return false;
  });
  if (done) break;
  await page.waitForTimeout(700);
}

// A fixed nav and day bar float over everything, and an element screenshot renders
// them on top of the card underneath, so take them out of the picture. Freezing the
// animations too: the sky breathes on a 19 second loop, so without this the same
// panel comes out slightly different on every run.
await page.addStyleTag({
  content: ".nav,.daybar,.saved{display:none!important;}" +
    "*,*::before,*::after{animation:none!important;transition:none!important;}",
});
await page.waitForTimeout(300);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.locator(".sky").first().screenshot({ path: join(CARDS, "hero.png") });
console.log("  captured hero");

await card("Today's care", "care");
await card("Medication courses", "courses");
await card("Sputum", "sputum");
await card("Symptoms", "symptoms");
await card("exacerbation", "exac", ".banner");
await click("Write this up for my doctor");
await page.waitForTimeout(900);
await card("For your team", "handover");

await click("^History$");
await page.waitForTimeout(1100);
const eps = page.locator(".ep");
if (await eps.count()) {
  await eps.first().screenshot({ path: join(CARDS, "episode.png") });
  console.log("  captured episode");
}

await click("Patterns");
await page.waitForTimeout(1400);
await card("Side by side", "timeline");
await card("Days between episodes", "gaps");
await card("Episodes a year", "yoy");

// Conditions, reminders and what you track live behind the gear in the header,
// not on the Report tab. clearOverlays would shut the sheet again, so the three
// captures below reach into it directly rather than going through click()/card().
await page.evaluate(() => {
  const g = document.querySelector('[aria-label="Settings"]');
  if (g) g.click();
});
await page.waitForTimeout(1100);
// pick two, because they do come together and an all-off card advertises nothing
// one click per evaluate, with a wait between: the row's handler closes over the
// condition list as it was at render time, so two clicks in a row on the same
// paint make the second one overwrite the first instead of adding to it
for (const label of ["Bronchiectasis", "Cystic fibrosis"]) {
  await page.evaluate((want) => {
    const c = [...document.querySelectorAll(".card")].find((x) => /What you live with/.test(x.textContent));
    if (!c) return;
    const b = [...c.querySelectorAll("button.trackrow")].find((x) => x.textContent.trim().startsWith(want));
    if (b && b.getAttribute("aria-pressed") !== "true") b.click();
  }, label);
  await page.waitForTimeout(600);
}
await cardIn("What you live with", "conditions");
// give the reminders card something to show before photographing it
await clickIn("Add a time");
await page.waitForTimeout(500);
await clickIn("Another time");
await page.waitForTimeout(700);
await cardIn("Daily reminders", "remind");
await cardIn("What you track", "track");
// back out of the sheet before the Report captures below
await clearOverlays();
await click("^Report$");
await page.waitForTimeout(1100);
// fill the appointment so the closing panel is not advertising an empty form
await page.evaluate(() => {
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
    s.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const c = [...document.querySelectorAll(".card")].find((x) => /Next appointment/.test(x.textContent));
  if (!c) return;
  const d = c.querySelector("input[type=date]");
  if (d) set(d, new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  const who = [...c.querySelectorAll("input")].find((i) => /who/i.test(i.placeholder || ""));
  if (who) set(who, "Dr Suwan, respiratory");
});
await page.waitForTimeout(900);
await page.evaluate(() => {
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
    s.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const c = [...document.querySelectorAll(".card")].find((x) => /to raise|to ask/i.test(x.textContent));
  if (!c) return;
  const box = [...c.querySelectorAll("input")].find((i) => /ask/i.test(i.placeholder || ""));
  const add = [...c.querySelectorAll("button")].find((b) => /^Add$/.test(b.textContent.trim()));
  if (box && add) { set(box, "Is it worth a CT this year, or is the last one still current?"); add.click(); }
});
await page.waitForTimeout(900);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.screenshot({ path: join(CARDS, "screen-report.png") });
console.log("  captured screen-report");
await shotCtx.close();

/* ------------------------------------------------------------------ */
/*  Compose                                                            */
/* ------------------------------------------------------------------ */

// the app's own faces, taken out of the build so the copy is set in the product's type
const built = readFileSync(join(root, "index.html"), "utf8");
const FONTS = (built.match(/@font-face\{[^}]*\}/g) || []).join("\n");
if (!FONTS) throw new Error("no @font-face found in index.html — build it first");

const panelHtml = (p) => {
  const shots = p.imgs
    .map((f, i) =>
      p.frame
        ? `<div class="frame"><img src="file://${join(CARDS, f)}"></div>`
        : `<img class="shot${i ? " stacked" : ""}" src="file://${join(CARDS, f)}">`
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:645px;height:1100px;overflow:hidden;background:${p.dark ? "#083645" : "#fff"};}
body{font-family:'Figtree',system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.top{flex:0 0 auto;background:${p.dark ? "transparent" : "#E9EDF3"};border-radius:0 0 30px 30px;padding:52px 44px 42px;}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.17em;text-transform:uppercase;
  color:${p.dark ? "#D6F24B" : "#057BC1"};margin-bottom:16px;}
h1{font-family:'Bricolage',system-ui,sans-serif;font-size:${p.head.length > 30 ? 42 : 46}px;font-weight:600;
  letter-spacing:-.035em;line-height:1.04;color:${p.dark ? "#fff" : "#083645"};white-space:pre-line;margin-bottom:18px;}
.sub{font-size:15px;line-height:1.55;color:${p.dark ? "rgba(255,255,255,.78)" : "#3A5460"};max-width:520px;}
/* the shot area clips at its own bottom edge, so a tall screen bleeds off the page
   the way a store panel does instead of running under the wordmark */
.stage{flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;
  align-items:center;padding:var(--pad,50px) 44px 0;}
.shot{width:${p.bleed ? 100 : 84}%;flex:0 0 auto;border-radius:${p.bleed ? 26 : 22}px;
  box-shadow:0 1px 2px rgba(8,54,69,.05), 0 26px 52px -22px rgba(8,54,69,.34);}
.shot.stacked{margin-top:22px;width:78%;}
.frame{width:76%;flex:0 0 auto;border-radius:36px;overflow:hidden;background:#0B2C38;padding:7px;
  box-shadow:0 0 0 1px rgba(255,255,255,.10), 0 34px 64px -26px rgba(0,0,0,.7);}
.frame img{display:block;width:100%;border-radius:30px;}
.mark{flex:0 0 auto;height:74px;line-height:74px;text-align:center;font-size:15px;font-weight:600;
  letter-spacing:-.01em;color:${p.dark ? "rgba(255,255,255,.42)" : "#A9B7BD"};background:${p.dark ? "#083645" : "#fff"};}
</style></head><body>
<div class="top">
  <div class="eyebrow">${p.eyebrow}</div>
  <h1>${p.head}</h1>
  <div class="sub">${p.sub}</div>
</div>
<div class="stage">
${shots}
</div>
<div class="mark">Clear</div>
</body></html>`;
};

const panelCtx = await browser.newContext({ viewport: { width: 645, height: 1100 }, deviceScaleFactor: 2 });
const sheet = await panelCtx.newPage();
const tmpHtml = join(CARDS, "panel.html");

for (const p of PANELS) {
  writeFileSync(tmpHtml, panelHtml(p));
  await sheet.goto("file://" + tmpHtml, { waitUntil: "load" });
  await sheet.waitForTimeout(500);
  // centre a short card in the room it has; a tall one keeps its 26px and bleeds
  const pad = await sheet.evaluate(() => {
    const stage = document.querySelector(".stage");
    const shots = [...document.querySelectorAll(".shot, .frame")];
    const used = shots.reduce((n, s, i) => n + s.getBoundingClientRect().height + (i ? 22 : 0), 0);
    return Math.max(26, Math.round((stage.clientHeight - used) / 2));
  });
  await sheet.addStyleTag({ content: `.stage{--pad:${pad}px;}` });
  await sheet.waitForTimeout(350);
  await sheet.screenshot({ path: join(OUT, p.file + ".jpg"), type: "jpeg", quality: 90 });
  console.log("  wrote screenshots/" + p.file + ".jpg");
}

await browser.close();
server.close();
rmSync(CARDS, { recursive: true, force: true });
console.log("\n" + PANELS.length + " panels written to screenshots/");
