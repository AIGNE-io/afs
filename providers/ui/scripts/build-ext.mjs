/**
 * Post-build: generate dist/web-page-ext.mjs with pre-computed, minified exports.
 *
 * Why a separate file instead of patching dist/web-page.mjs:
 *   - dist/web-page.mjs uses `unbundle: true` (template expressions, not evaluated strings)
 *   - Patching template literals with regex is fragile and breaks source maps
 *   - A generated file with JSON.stringify'd strings has zero runtime import overhead
 *
 * Output: dist/web-page-ext.{mjs,cjs} containing:
 *   - WEB_CLIENT_CSS: raw CSS string
 *   - WEB_CLIENT_JS:  minified JS IIFE string
 *   - WEB_CLIENT_HTML_SHELL_TEMPLATE: HTML shell with __ASSET_HASH__ placeholder
 */

// biome-ignore lint/style/noRestrictedImports: build script runs in Node, not Workers
import { writeFileSync } from "node:fs";
import { transform } from "esbuild";

// Dynamic import evaluates all template expressions in the unbundled module tree
const m = await import("../dist/web-page.mjs");

// ── Minify JS ──
const { code: jsMinified } = await transform(m.WEB_CLIENT_JS, {
  minify: true,
  target: "es2020",
});
const js = jsMinified.trimEnd();

// ── CSS (no minification — already compact, and CSS minify risks breaking var() expressions) ──
const css = m.WEB_CLIENT_CSS;

// ── HTML shell with placeholder ──
const shell = m.buildAupHtmlShell("__ASSET_HASH__");

// ── Write ESM ──
const esm = [
  `export const WEB_CLIENT_CSS = ${JSON.stringify(css)};`,
  `export const WEB_CLIENT_JS = ${JSON.stringify(js)};`,
  `export const WEB_CLIENT_HTML_SHELL_TEMPLATE = ${JSON.stringify(shell)};`,
].join("\n");
writeFileSync("dist/web-page-ext.mjs", esm);

// ── Write CJS ──
const cjs = [
  `"use strict";`,
  `exports.WEB_CLIENT_CSS = ${JSON.stringify(css)};`,
  `exports.WEB_CLIENT_JS = ${JSON.stringify(js)};`,
  `exports.WEB_CLIENT_HTML_SHELL_TEMPLATE = ${JSON.stringify(shell)};`,
].join("\n");
writeFileSync("dist/web-page-ext.cjs", cjs);

// ── Type declarations (TypeScript needs these for check-types to pass) ──
const dts = [
  `export declare const WEB_CLIENT_CSS: string;`,
  `export declare const WEB_CLIENT_JS: string;`,
  `export declare const WEB_CLIENT_HTML_SHELL_TEMPLATE: string;`,
].join("\n");
writeFileSync("dist/web-page-ext.d.mts", dts);
writeFileSync("dist/web-page-ext.d.cts", dts);

// ── Report ──
const pct = ((1 - js.length / m.WEB_CLIENT_JS.length) * 100).toFixed(0);
console.log(
  `✓ web-page-ext.mjs: JS ${(m.WEB_CLIENT_JS.length / 1024).toFixed(0)}KB → ${(js.length / 1024).toFixed(0)}KB (-${pct}%)`,
);
console.log(`✓ web-page-ext.mjs: CSS ${(css.length / 1024).toFixed(0)}KB (unchanged)`);
console.log(`✓ web-page-ext.mjs: Shell ${(shell.length / 1024).toFixed(1)}KB`);
