import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const BUILD = require.resolve("../build.mjs");
const CONFIG = require.resolve("../../../electron-builder.config.cjs");
const ELECTRON = path.dirname(require.resolve("../../../electron/main.ts"));

const strings = (list) => [...list.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);

/** Files main-process code loads from beside its bundle: path.join(__dirname, "<file>"). */
const besideBundleRefs = (source) =>
  [...source.matchAll(/join\(\s*__dirname\s*,\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);

/** Relative src/href a page loads, so they resolve beside it inside app.asar. */
const pageAssetRefs = (html) =>
  [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"':#?]+)["']/g)].map((m) => m[1]).filter((f) => !f.startsWith("/"));

const electronSources = (ext) =>
  fs
    .readdirSync(ELECTRON, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(ext) && !f.split(/[\\/]/).includes("tests"))
    .map((f) => ({ name: path.basename(f), source: fs.readFileSync(path.join(ELECTRON, f), "utf8") }));

/** The files build.mjs writes into the staged app folder, read from its source without running it. */
function stagedAppFiles(source) {
  const entries = source.match(/entryPoints:\s*\{([\s\S]*?)\n\s*\}/);
  if (!entries) throw new Error("build.mjs: esbuild entryPoints not found");
  const bundles = [...entries[1].matchAll(/^\s*(?:["']([^"']+)["']|([\w$]+))\s*:/gm)].map(
    (m) => `${m[1] ?? m[2]}.js`,
  );
  if (!/outdir:\s*appDir\b/.test(source)) throw new Error("build.mjs: esbuild no longer writes to appDir");

  const lastBefore = (pattern, end) => [...source.slice(0, end).matchAll(pattern)].at(-1);
  const resolve = (arg, at) => {
    const literal = arg.match(/^["'`]([^"'`]+)["'`]$/);
    if (literal) return [literal[1]];
    if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
      const loop = lastBefore(
        new RegExp(`for\\s*\\(\\s*const\\s+${arg}\\s+of\\s+\\[([^\\]]*)\\]`, "g"),
        at,
      );
      const constant = lastBefore(
        new RegExp(`const\\s+${arg}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`, "g"),
        at,
      );
      if (loop && (!constant || loop.index > constant.index)) return strings(loop[1]);
      if (constant) return [constant[1]];
    }
    throw new Error(`build.mjs writes join(appDir, ${arg}): teach this test what that names`);
  };
  const copies = [...source.matchAll(/join\(\s*appDir\s*,\s*([^)]+?)\s*\)/g)].flatMap((m) =>
    resolve(m[1], m.index),
  );
  return [...new Set([...bundles, ...copies])];
}

describe("packaged app files (app.asar)", () => {
  const staged = stagedAppFiles(fs.readFileSync(BUILD, "utf8"));

  it("finds the bundles and copies build.mjs stages", () => {
    expect(staged).toEqual(
      expect.arrayContaining([
        "main.js",
        "grammar-worker.js",
        "preload.js",
        "splash.html",
        "harper_wasm_slim_bg.wasm",
        "package.json",
      ]),
    );
  });

  it("every file build.mjs stages is packed: with onlyLoadAppFromAsar a missing one is gone at runtime", () => {
    const { files } = require(CONFIG);
    expect(staged.filter((f) => !files.includes(f))).toEqual([]);
  });

  it("every file the main process loads beside its bundle is staged by build.mjs", () => {
    const loaded = electronSources(".ts").flatMap(({ source }) => besideBundleRefs(source));
    expect(loaded).toEqual(expect.arrayContaining(["preload.js", "grammar-worker.js"]));
    expect(loaded.filter((f) => !staged.includes(f))).toEqual([]);
  });

  it("every asset a staged page loads is staged too", () => {
    const pages = electronSources(".html").filter(({ name }) => staged.includes(name));
    expect(pages.map(({ name }) => name)).toContain("splash.html");
    const assets = pages.flatMap(({ source }) => pageAssetRefs(source));
    expect(assets).toContain("splash-logo.png");
    expect(assets.filter((f) => !staged.includes(f))).toEqual([]);
  });

  it("reads each kind of staging build.mjs uses", () => {
    const source = `
      await esbuild({ entryPoints: {
        main: "electron/main.ts",
        "licence-preload": "electron/licence-preload.ts",
      }, outdir: appDir });
      for (const f of ["splash.html", "licence.html"]) cpSync(join(root, "electron", f), join(appDir, f));
      const wasm = "grammar.wasm";
      cpSync(src, join(appDir, wasm));
      writeFileSync(join(appDir, "package.json"), "{}");
    `;
    expect(stagedAppFiles(source).sort()).toEqual(
      ["grammar.wasm", "licence-preload.js", "licence.html", "main.js", "package.json", "splash.html"],
    );
    expect(() => stagedAppFiles(`entryPoints: {\n main: "m"\n }, outdir: appDir; join(appDir, pick())`)).toThrow(
      /teach this test/,
    );
  });

  it("reads the runtime references it checks", () => {
    expect(
      besideBundleRefs(`const root = path.join(__dirname, "..", "..");
        preload: path.join(__dirname, "licence-preload.js"),
        fork(path.join(__dirname, 'worker.js'))`),
    ).toEqual(["licence-preload.js", "worker.js"]);
    expect(
      pageAssetRefs(`<img src="logo.png"><link href="licence.css" rel="stylesheet">
        <a href="https://example.com/x">x</a><a href="#top">t</a><img src="data:image/png;base64,AA">`),
    ).toEqual(["logo.png", "licence.css"]);
  });
});
