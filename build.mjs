// Build Clear: bundle the source and inline it into the single-file app.
//
//   npm install
//   node build/build.mjs
//
// Writes index.html at the repo root. That one file is the entire app: React,
// both fonts and the icon are all embedded, so it runs from any static host with
// no build step and no network requests except the optional air quality lookup.

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [resolve(root, "src/clear-app.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
});

const bundle = result.outputFiles[0].text;

// A stray closing tag inside the bundle would end the document early and produce
// a blank app, so fail loudly rather than shipping it.
if (bundle.includes("</script")) {
  throw new Error("bundle contains a closing script tag");
}

const template = readFileSync(resolve(root, "build/template.html"), "utf8");
if (!template.includes("__BUNDLE__")) {
  throw new Error("template.html is missing the __BUNDLE__ placeholder");
}

const html = template.replace("__BUNDLE__", () => bundle);
writeFileSync(resolve(root, "index.html"), html);

const version = (readFileSync(resolve(root, "src/clear-app.jsx"), "utf8").match(
  /const BUILD = "([^"]+)"/
) || [])[1];

console.log(`built index.html  ${Math.round(html.length / 1024)} KB  (Clear ${version || "?"})`);
console.log("test it locally before committing:  npx serve . , then open the page");
