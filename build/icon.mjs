/*
 * Regenerates the home screen icon and writes it back into build/template.html.
 *
 *   node build/icon.mjs
 *
 * The icon is a Bricolage "C" on the same sky the app opens with. The letter is
 * drawn with the very font the app already carries, pulled straight out of the
 * @font-face block in the source so the two can never drift apart.
 *
 * Four copies of the icon live in the template: the apple-touch-icon, the
 * favicon, and two entries in the runtime manifest. All four are replaced.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "clear-app.jsx");
const TEMPLATE = join(ROOT, "build", "template.html");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  console.error("playwright is not installed. Run: npm i --no-save playwright");
  process.exit(1);
}

/* Lift the Bricolage face out of the app's stylesheet rather than keeping a
   second copy of the font in the repo. */
const src = readFileSync(SRC, "utf8");
const face = src.match(/@font-face\{font-family:'Bricolage'[^}]*\}/);
if (!face) {
  console.error("could not find the Bricolage @font-face in src/clear-app.jsx");
  process.exit(1);
}

// A single letter at icon size wants a simpler ramp than the app header, which
// has six stops and fades to canvas at the very bottom. Fading to near-white
// under the letter would eat the bottom of the C on a light home screen.
const page_ = (px) => `<!doctype html><meta charset="utf-8"><style>
${face[0]}
*{margin:0;padding:0;}
html,body{width:${px}px;height:${px}px;overflow:hidden;}
.tile{width:${px}px;height:${px}px;position:relative;
  background:linear-gradient(168deg,#0A5F97 0%,#057BC1 46%,#2FA5DC 82%,#4DD8FF 100%);}
/* the same off-centre glow the app's sky carries, so the icon and the first
   screen you land on look like the same object */
.tile::before{content:"";position:absolute;top:${-0.30 * px}px;right:${-0.24 * px}px;
  width:${0.78 * px}px;height:${0.78 * px}px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.30) 0%,rgba(255,255,255,0) 70%);}
/* No letter-spacing: on a single glyph it only pads the advance box, which
   then drags the letter off centre when the box is what gets centred. */
.c{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-family:'Bricolage';font-weight:600;font-size:${0.78 * px}px;
  color:#fff;line-height:1;
  text-shadow:0 ${0.012 * px}px ${0.035 * px}px rgba(8,54,69,.22);}
</style><div class="tile"><div class="c" id="c">C</div></div>`;

const browser = await chromium.launch(
  existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}
);

const render = async (px) => {
  const ctx = await browser.newContext({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(page_(px), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  // A C is centred when its ink is centred, not when its em box is. Measure the
  // painted pixels and shift by whatever is left over, which also absorbs the
  // optical overshoot at the top and bottom of a round glyph.
  const off = await p.evaluate((size) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    const el = document.getElementById("c");
    const cs = getComputedStyle(el);
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText("C", size / 2, size / 2);
    const d = g.getImageData(0, 0, size, size).data;
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (d[(y * size + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return { dx: 0, dy: 0 };
    return { dx: size / 2 - (x0 + x1) / 2, dy: size / 2 - (y0 + y1) / 2 };
  }, px);
  await p.evaluate((o) => {
    document.getElementById("c").style.transform = `translate(${o.dx}px, ${o.dy}px)`;
  }, off);
  await p.waitForTimeout(120);
  const buf = await p.screenshot({ type: "png" });
  await ctx.close();
  return buf.toString("base64");
};

const small = await render(180);
const large = await render(512);
await browser.close();

/* The template holds them in a fixed order: apple-touch-icon, favicon, then the
   manifest's 512 and 180. Swap by position so a re-run is idempotent. */
let html = readFileSync(TEMPLATE, "utf8");
const want = [small, small, large, small];
let i = 0;
html = html.replace(/base64,[A-Za-z0-9+/=]{500,}/g, (m) => {
  const next = want[i++];
  return next ? "base64," + next : m;
});
if (i !== 4) {
  console.error(`expected 4 icons in the template, replaced ${i}`);
  process.exit(1);
}
writeFileSync(TEMPLATE, html);
console.log(`icon written into build/template.html  (180px ${small.length}b64, 512px ${large.length}b64)`);
console.log("now run:  npm run build");
