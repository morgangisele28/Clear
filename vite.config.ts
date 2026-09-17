import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

// Clear ships as one self-contained HTML file. That is not a packaging
// preference, it is the product promise: the app has nowhere to send anything
// to, and it has to keep working with the network off. Everything the app needs
// — script, styles, fonts, icon — is inlined here, so the only thing a host
// serves is a static document.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // The entry document lives in app/ so that the repo root index.html — the
  // currently deployed app — is never clobbered by a dev build. The release
  // step copies dist/index.html over it deliberately.
  root: resolve(import.meta.dirname, "app"),
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // Inline every asset regardless of size; nothing may become a second request.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    target: "es2022",
    reportCompressedSize: false,
  },
  test: {
    // The build root is app/, but the code under test lives in src/ at the repo
    // root, so the test runner is anchored back there explicitly.
    root: resolve(import.meta.dirname, "."),
    globals: true,
    // Every test here is a pure function on plain data, so nothing can leak
    // between files and a worker per file is wasted startup.
    isolate: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
