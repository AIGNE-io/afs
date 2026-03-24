#!/usr/bin/env bun
/**
 * OSS Sync Script
 *
 * Copies open-source packages from the monorepo to a target directory,
 * stripping closed-source components (WM, proprietary providers).
 *
 * Usage:
 *   bun scripts/sync-oss.ts <target-directory>
 *
 * The target directory will contain a clean, buildable open-source monorepo.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// ── Configuration ──────────────────────────────────────────────────────────

/** Packages under packages/ to include in OSS release. */
const OSS_PACKAGES = ["core", "aup", "testing", "provider-utils", "cli", "explorer"];

/** Providers under providers/{category}/ to include in OSS release. */
const OSS_PROVIDERS = [
  "fs",
  "git",
  "json",
  "toml",
  "sqlite",
  "http",
  "mcp",
  "markdown",
  "ui", // WM code will be stripped
];

/** Map provider name → category subdirectory (after directory restructure). */
const PROVIDER_CATEGORY: Record<string, string> = {
  fs: "basic",
  git: "platform",
  json: "core",
  toml: "core",
  sqlite: "platform",
  http: "basic",
  mcp: "runtime",
  markdown: "core",
  ui: "runtime",
};

/** Files to exclude from providers/ui/ (relative to providers/ui/). */
const UI_EXCLUDED_FILES = [
  "src/wm-state.ts",
  "src/ui-wm-routes.ts",
  "src/aup-wm-session-logic.ts",
  "src/explorer-app.ts",
  "src/portal-setup.ts",
  "src/web-page/renderers/wm.ts",
];

/** Test file patterns to exclude from providers/ui/test/. */
const UI_EXCLUDED_TEST_PATTERNS = [/^wm-.*\.test\.ts$/, /^explorer-.*\.test\.ts$/];

/** Additional specific test files to exclude from providers/ui/test/. */
const UI_EXCLUDED_TESTS = [
  "test/aup-dispatch.test.ts",
  "test/portal-setup-security.test.ts",
  "test/session-persist.test.ts",
  "test/style-migration.test.ts",
];

/** Files to exclude from packages/core/ (tests that reference closed-source fixtures). */
const CORE_EXCLUDED_FILES = [
  "test/program/assistant-program.test.ts",
  "test/e2e-mount-gate.test.ts",
];

/** Files to exclude from packages/cli/ (tests that reference closed-source fixtures). */
const CLI_EXCLUDED_FILES = [
  "test/e2e/tests/install.test.ts",
  "test/config/afs-loader.test.ts",
  "test/config/provider-factory.test.ts",
  "test/core/lazy-loading.test.ts",
];

/** Files to exclude from spec/ (internal review notes). */
const SPEC_EXCLUDED_FILES = ["phase-0b-review.md"];

/** Files to exclude from conformance/ (platform-specific launch scripts). */
const CONFORMANCE_EXCLUDED_FILES = ["run-swift.sh", "run-kotlin.sh"];

/** Root-level files/dirs to copy from source repo. */
const ROOT_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "biome.json",
  "turbo.json",
  "tsconfig.json",
  "CLAUDE.md",
  "RELEASING.md",
  ".npmrc",
  ".gitignore",
  "typescript-config",
  "scripts",
];

/** OSS template files to copy from scripts/oss-templates/ to target root. */
const OSS_TEMPLATE_FILES = ["README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md"];

/** OSS examples to copy from examples/ in the main repo. */
const OSS_EXAMPLES = ["basic", "custom-provider", "hello-aup"];

/** SPDX license identifier for BSL-1.1. */
const OSS_LICENSE_ID = "BUSL-1.1";

/** Closed-source provider package names to remove from CLI optionalDependencies. */
const CLOSED_SOURCE_PROVIDERS = [
  "@aigne/afs-aignehub",
  "@aigne/afs-ash",
  "@aigne/afs-telegram",
  "@aigne/afs-web-device",
  "@aigne/afs-registry",
  "@aigne/afs-workspace",
  "@aigne/afs-mcp-recipe",
  "@aigne/afs-ui-wm",
  "@aigne/afs-vault",
  "@aigne/afs-slack",
  "@aigne/afs-discord",
  "@aigne/afs-lark",
  "@aigne/afs-dingtalk",
  "@aigne/afs-wecom",
  "@aigne/afs-mattermost",
  "@aigne/afs-matrix",
  "@aigne/afs-homeassistant",
  "@aigne/afs-frigate",
  "@aigne/afs-tesla",
  "@aigne/afs-synology",
  "@aigne/afs-omada",
  "@aigne/afs-did-space",
  "@aigne/afs-ocap",
  "@aigne/afs-rotation",
  "@aigne/afs-kv",
  "@aigne/afs-cf-pages",
  "@aigne/afs-r2",
  "@aigne/afs-local-fs",
  "@aigne/afs-aws-cost",
  "@aigne/afs-gcp-cost",
  "@aigne/afs-github-cost",
  "@aigne/afs-cloudflare-cost",
  "@aigne/afs-cloud-cost",
  // Providers not in OSS release
  "@aigne/afs-sandbox",
  "@aigne/afs-s3",
  "@aigne/afs-gcs",
  "@aigne/afs-ec2",
  "@aigne/afs-gce",
  "@aigne/afs-dns",
  "@aigne/afs-cloudflare",
  "@aigne/afs-github",
  // Packages not in OSS release
  "@aigne/afs-trust",
  "@aigne/afs-session",
  "@aigne/afs-compute-abstraction",
  "@aigne/afs-mapping",
  "@aigne/afs-world-mapping",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logSection(msg: string) {
  console.log(`\n── ${msg} ──`);
}

/**
 * Copy a directory, applying an optional file filter.
 * filter(relativePath) returns false to exclude a file.
 */
function copyDir(src: string, dest: string, filter?: (relPath: string) => boolean) {
  if (!existsSync(src)) {
    log(`⚠ source not found: ${src}`);
    return;
  }
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      if (!filter) return true;
      // Compute relative path from src root
      const rel = source.slice(src.length).replace(/^\//, "");
      if (rel === "") return true; // always copy root dir
      return filter(rel);
    },
  });
}

// ── Patch functions ────────────────────────────────────────────────────────

/**
 * Patch providers/ui/src/web-page.ts — remove WM import and template reference.
 */
function patchWebPage(filePath: string) {
  let content = readFileSync(filePath, "utf-8");

  // Remove: import { WM_JS } from "./web-page/renderers/wm.js";
  content = content.replace(/import \{ WM_JS \} from "\.\/web-page\/renderers\/wm\.js";\n/, "");

  // Remove: ${WM_JS} line
  content = content.replace(/\$\{WM_JS\}\n/, "");

  writeFileSync(filePath, content);
  log("patched web-page.ts (removed WM renderer)");
}

/**
 * Patch providers/ui/src/web-page/css.ts — remove WM CSS block.
 *
 * The WM CSS is between the marker comment and the closing backtick of
 * the CSS template literal. We preserve everything before and after.
 */
function patchCss(filePath: string) {
  let content = readFileSync(filePath, "utf-8");

  // Remove the entire WM CSS block:
  // From "  /* ════...═══ WM — Window Manager ...═══ */" to just before the closing `;
  // The block starts with the WM section comment and ends at the last WM rule.
  const wmStart =
    "  /* ════════════════════════════════════════════════════════\n     WM — Window Manager (compositor layer)\n     ════════════════════════════════════════════════════════ */";

  const wmStartIdx = content.indexOf(wmStart);
  if (wmStartIdx === -1) {
    log("⚠ WM CSS marker not found in css.ts — skipping");
    return;
  }

  // Find the closing backtick+semicolon of the CSS template literal
  // It's the "`;⏎" that comes after all WM CSS rules
  const closingMarker = "\n`;";
  const closingIdx = content.indexOf(closingMarker, wmStartIdx);
  if (closingIdx === -1) {
    log("⚠ CSS template closing not found — skipping");
    return;
  }

  // Remove from WM start to just before the closing marker (keep the `;\n)
  content = content.slice(0, wmStartIdx) + content.slice(closingIdx);

  // Also clean up the .wm-container exclusion in the full-page selector
  content = content.replace(/:not\(\.wm-container\)/g, "");

  writeFileSync(filePath, content);
  log("patched css.ts (removed WM CSS block)");
}

/**
 * Patch providers/ui/src/index.ts — remove WM exports, make base the default.
 */
function patchUiIndex(filePath: string) {
  let content = readFileSync(filePath, "utf-8");

  // Remove: export { AUPWMSessionLogic } from "./aup-wm-session-logic.js";
  content = content.replace(
    /export \{ AUPWMSessionLogic \} from "\.\/aup-wm-session-logic\.js";\n/,
    "",
  );

  // Remove: export { AFSUIWMProvider, AFSUIWMProvider as AFSUIProvider } from "./ui-wm-routes.js";
  content = content.replace(
    /export \{ AFSUIWMProvider, AFSUIWMProvider as AFSUIProvider \} from "\.\/ui-wm-routes\.js";\n/,
    "",
  );

  // Remove: export { ... } from "./explorer-app.js";
  content = content.replace(/export \{[^}]*\} from "\.\/explorer-app\.js";\n/, "");

  // Remove: export { ... } from "./portal-setup.js";
  content = content.replace(/export \{[^}]*\} from "\.\/portal-setup\.js";\n/, "");

  // Make AFSUIProviderBase the default export name:
  // Change: export { AFSUIProvider as AFSUIProviderBase, ...
  // To:     export { AFSUIProvider, AFSUIProvider as AFSUIProviderBase, ...
  content = content.replace(
    /export \{ AFSUIProvider as AFSUIProviderBase,/,
    "export { AFSUIProvider, AFSUIProvider as AFSUIProviderBase,",
  );

  writeFileSync(filePath, content);
  log("patched index.ts (removed WM exports, base is now default)");
}

/**
 * Patch providers/ui/src/web-page/core.ts — remove WM case in renderer switch.
 */
function patchCore(filePath: string) {
  let content = readFileSync(filePath, "utf-8");

  // Remove: case "wm": el = renderAupWm(node); break;
  content = content.replace(/\s*case "wm": el = renderAupWm\(node\); break;\n/, "\n");

  writeFileSync(filePath, content);
  log("patched core.ts (removed WM case)");
}

/**
 * Patch providers/ui/src/ui-provider.ts — remove explorer-app.js import
 * and WM dynamic import, stub ExplorerAFS type inline.
 */
function patchUiProvider(filePath: string) {
  let content = readFileSync(filePath, "utf-8");

  // 1. Remove the explorer-app.js import block
  content = content.replace(/import \{[^}]*\} from "\.\/explorer-app\.js";\n/, "");

  // 2. Add inline ExplorerAFS type after the last import (before first export/interface)
  content = content.replace(
    /^(export interface AFSUIProviderOptions)/m,
    `/** Minimal AFS facade for agent submit (explorer-app excluded in OSS). */
interface ExplorerAFS {
  read(path: string): Promise<{ data?: unknown }>;
  list(path: string): Promise<{ data: unknown[] }>;
  stat?(path: string): Promise<{ data?: unknown }>;
  explain?(path: string): Promise<{ data?: unknown }>;
  exec?(path: string, args?: Record<string, unknown>): Promise<{ data?: unknown }>;
}

$1`,
  );

  // 3. Remove the entire "Explorer events" block (resolveExplorerExec + handleExplorerEvent)
  //    Replace with a comment, keeping the surrounding code intact.
  content = content.replace(
    / {4}\/\/ ── Explorer events ──\n {4}const explorerMapping = resolveExplorerExec\(exec, args\);\n {4}if \(explorerMapping\) \{[\s\S]*?\n {4}\}\n\n {4}\/\/ ── Mount configuration form/,
    "    // ── Explorer events (stripped in OSS) ──\n\n    // ── Mount configuration form",
  );

  writeFileSync(filePath, content);
  log("patched ui-provider.ts (removed explorer-app + WM dynamic import)");
}

/**
 * Patch CLI package.json — remove closed-source optionalDependencies.
 */
function patchCliPackageJson(filePath: string) {
  const pkg = JSON.parse(readFileSync(filePath, "utf-8"));

  for (const section of ["dependencies", "optionalDependencies", "devDependencies"] as const) {
    if (pkg[section]) {
      for (const name of CLOSED_SOURCE_PROVIDERS) {
        delete pkg[section][name];
      }
      if (Object.keys(pkg[section]).length === 0) {
        delete pkg[section];
      }
    }
  }

  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  log("patched CLI package.json (removed closed-source deps)");
}

/**
 * Patch all package.json files to use BSL-1.1 license.
 */
function patchAllLicenses(targetDir: string) {
  const dirs = [
    ...OSS_PACKAGES.map((p) => join(targetDir, "packages", p)),
    ...OSS_PROVIDERS.map((p) => join(targetDir, "providers", p)),
  ];

  let count = 0;
  for (const dir of dirs) {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (pkg.license !== OSS_LICENSE_ID) {
      pkg.license = OSS_LICENSE_ID;
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
      count++;
    }
  }

  // Also patch root package.json
  const rootPkg = join(targetDir, "package.json");
  if (existsSync(rootPkg)) {
    const pkg = JSON.parse(readFileSync(rootPkg, "utf-8"));
    pkg.license = OSS_LICENSE_ID;
    writeFileSync(rootPkg, `${JSON.stringify(pkg, null, 2)}\n`);
    count++;
  }

  log(`patched ${count} package.json files (license → ${OSS_LICENSE_ID})`);
}

/**
 * Patch pnpm-workspace.yaml — remove demo/example/benchmark/integration globs.
 */
function patchWorkspace(filePath: string) {
  let content = readFileSync(filePath, "utf-8");
  // Keep: scripts, typescript-config, packages/*, providers/*, examples/*
  content = content.replace(/ {2}- demos\/\*\n/, "");
  content = content.replace(/ {2}- benchmarks\n/, "");
  content = content.replace(/ {2}- integration-tests\n/, "");
  // OSS providers are flat (providers/{name}), not categorized (providers/{category}/{name})
  content = content.replace("  - providers/*/*\n", "  - providers/*\n");
  // Ensure examples/* and conformance are present
  if (!content.includes("examples/*")) {
    content = content.replace("  - providers/*\n", "  - providers/*\n  - examples/*\n");
  }
  if (!content.includes("conformance")) {
    content = content.replace("  - providers/*\n", "  - providers/*\n  - conformance\n");
  }
  writeFileSync(filePath, content);
  log("patched pnpm-workspace.yaml");
}

// ── Main ───────────────────────────────────────────────────────────────────

const srcRoot = resolve(import.meta.dir, "..");
const targetArg = process.argv[2];

if (!targetArg) {
  console.error("Usage: bun scripts/sync-oss.ts <target-directory>");
  console.error("");
  console.error("Copies open-source packages to target, stripping closed-source components.");
  process.exit(1);
}

const target = resolve(targetArg);
const dryRun = process.argv.includes("--dry-run");

console.log(`AFS OSS Sync`);
console.log(`  source: ${srcRoot}`);
console.log(`  target: ${target}`);
if (dryRun) console.log("  (dry run — no files will be written)");

// Ensure target exists
if (!dryRun) {
  mkdirSync(target, { recursive: true });
}

// ── Step 1: Copy root files ──────────────────────────────────────────────

logSection("Root files");
for (const name of ROOT_FILES) {
  const src = join(srcRoot, name);
  const dest = join(target, name);
  if (!existsSync(src)) {
    log(`⚠ not found: ${name}`);
    continue;
  }
  if (!dryRun) {
    cpSync(src, dest, { recursive: true });
  }
  log(`✓ ${name}`);
}

// Copy OSS template files (README, LICENSE, CONTRIBUTING, SECURITY)
logSection("OSS templates");
const templatesDir = join(srcRoot, "scripts/oss-templates");
for (const name of OSS_TEMPLATE_FILES) {
  const src = join(templatesDir, name);
  const dest = join(target, name);
  if (!existsSync(src)) {
    log(`⚠ template not found: ${name}`);
    continue;
  }
  if (!dryRun) {
    cpSync(src, dest, { recursive: true });
  }
  log(`✓ ${name}`);
}

// Copy OSS examples from examples/ in the main repo
logSection("Examples");
const examplesDir = join(target, "examples");
if (!dryRun) mkdirSync(examplesDir, { recursive: true });

// Copy examples/README.md from oss-templates (index page for OSS examples)
const exReadme = join(templatesDir, "examples/README.md");
if (existsSync(exReadme)) {
  if (!dryRun) cpSync(exReadme, join(examplesDir, "README.md"));
  log("✓ examples/README.md");
}

for (const name of OSS_EXAMPLES) {
  const src = join(srcRoot, "examples", name);
  const dest = join(examplesDir, name);
  if (!existsSync(src)) {
    log(`⚠ example not found: examples/${name}`);
    continue;
  }
  if (!dryRun) {
    copyDir(src, dest);
  }
  log(`✓ examples/${name}`);
}

// ── Step 1a.2: Copy evaluation ──────────────────────────────────────────

logSection("Evaluation");

{
  const evalSrc = join(srcRoot, "evaluation");
  const evalDest = join(target, "evaluation");
  if (existsSync(evalSrc)) {
    if (!dryRun) {
      copyDir(evalSrc, evalDest, (relPath) => {
        // Exclude node_modules, db files, generated FS fixtures
        if (relPath.startsWith("node_modules/")) return false;
        if (relPath.endsWith(".db")) return false;
        if (relPath.startsWith("fixtures/todos-fs/")) return false;
        return true;
      });
    }
    log("✓ evaluation/ (RQ1-RQ3 experiments)");
  } else {
    log("⚠ evaluation/ not found");
  }
}

// ── Step 1b: Copy spec and conformance ───────────────────────────────────

logSection("Specs & Conformance");

// Copy spec/ (protocol specifications, excluding internal review docs)
{
  const specSrc = join(srcRoot, "spec");
  const specDest = join(target, "spec");
  if (existsSync(specSrc)) {
    const excludeSet = new Set(SPEC_EXCLUDED_FILES);
    if (!dryRun) {
      copyDir(specSrc, specDest, (relPath) => !excludeSet.has(relPath));
    }
    log("✓ spec/ (AFS + AUP protocol specifications)");
  } else {
    log("⚠ spec/ not found");
  }
}

// Copy conformance/ (YAML-driven test runner + specs, excluding platform scripts and node_modules)
{
  const confSrc = join(srcRoot, "conformance");
  const confDest = join(target, "conformance");
  if (existsSync(confSrc)) {
    const excludeSet = new Set(CONFORMANCE_EXCLUDED_FILES);
    if (!dryRun) {
      copyDir(confSrc, confDest, (relPath) => {
        if (relPath.startsWith("node_modules")) return false;
        return !excludeSet.has(relPath);
      });
    }
    log("✓ conformance/ (test runner + L1/L2/L3 specs)");
  } else {
    log("⚠ conformance/ not found");
  }
}

// ── Step 2: Copy OSS packages ────────────────────────────────────────────

logSection("Packages");
const pkgDir = join(target, "packages");
if (!dryRun) mkdirSync(pkgDir, { recursive: true });

for (const pkg of OSS_PACKAGES) {
  const src = join(srcRoot, "packages", pkg);
  const dest = join(pkgDir, pkg);
  if (!existsSync(src)) {
    log(`⚠ not found: packages/${pkg}`);
    continue;
  }

  // Package-specific exclusions
  const exclusionMap: Record<string, string[]> = {
    core: CORE_EXCLUDED_FILES,
    cli: CLI_EXCLUDED_FILES,
  };
  const exclusions = exclusionMap[pkg];

  if (exclusions) {
    const excludeSet = new Set(exclusions);
    if (!dryRun) {
      copyDir(src, dest, (relPath) => !excludeSet.has(relPath));
    }
    log(`✓ packages/${pkg} (excluded ${excludeSet.size} closed-source test files)`);
  } else {
    if (!dryRun) {
      copyDir(src, dest);
    }
    log(`✓ packages/${pkg}`);
  }
}

// ── Step 3: Copy OSS providers ───────────────────────────────────────────

logSection("Providers");
const provDir = join(target, "providers");
if (!dryRun) mkdirSync(provDir, { recursive: true });

for (const prov of OSS_PROVIDERS) {
  const category = PROVIDER_CATEGORY[prov] ?? prov;
  const src = join(srcRoot, "providers", category, prov);
  const dest = join(provDir, prov);

  if (!existsSync(src)) {
    log(`⚠ not found: providers/${prov}`);
    continue;
  }

  if (prov === "ui") {
    // UI provider: exclude WM-specific files
    const excludeSet = new Set([...UI_EXCLUDED_FILES, ...UI_EXCLUDED_TESTS]);
    if (!dryRun) {
      copyDir(src, dest, (relPath) => {
        // Check exact file exclusions
        if (excludeSet.has(relPath)) return false;
        // Check test file patterns
        if (relPath.startsWith("test/")) {
          const filename = basename(relPath);
          for (const pat of UI_EXCLUDED_TEST_PATTERNS) {
            if (pat.test(filename)) return false;
          }
        }
        return true;
      });
    }
    log(`✓ providers/${prov} (WM files excluded)`);
  } else {
    if (!dryRun) {
      copyDir(src, dest);
    }
    log(`✓ providers/${prov}`);
  }
}

// ── Step 4: Apply patches ────────────────────────────────────────────────

logSection("Patching UI provider");

if (!dryRun) {
  const uiSrc = join(target, "providers/ui/src");

  patchWebPage(join(uiSrc, "web-page.ts"));
  patchCss(join(uiSrc, "web-page/css.ts"));
  patchUiIndex(join(uiSrc, "index.ts"));
  patchCore(join(uiSrc, "web-page/core.ts"));
  patchUiProvider(join(uiSrc, "ui-provider.ts"));
}

logSection("Patching CLI");

if (!dryRun) {
  patchCliPackageJson(join(target, "packages/cli/package.json"));
}

// Patch conformance package.json — remove test script (it's a tool, not a unit test)
{
  const confPkg = join(target, "conformance/package.json");
  if (!dryRun && existsSync(confPkg)) {
    const pkg = JSON.parse(readFileSync(confPkg, "utf-8"));
    if (pkg.scripts?.test) {
      delete pkg.scripts.test;
    }
    writeFileSync(confPkg, `${JSON.stringify(pkg, null, 2)}\n`);
    log("patched conformance package.json (removed test script from turbo pipeline)");
  }
}

logSection("Patching workspace");

if (!dryRun) {
  patchWorkspace(join(target, "pnpm-workspace.yaml"));
}

logSection("Patching licenses");

if (!dryRun) {
  patchAllLicenses(target);
}

// ── Step 5: Summary ──────────────────────────────────────────────────────

logSection("Summary");
log(`Packages: ${OSS_PACKAGES.length}`);
log(`Providers: ${OSS_PROVIDERS.length}`);
log(`UI excluded files: ${UI_EXCLUDED_FILES.length}`);
log(`UI excluded test patterns: ${UI_EXCLUDED_TEST_PATTERNS.length}`);

console.log("\nDone! Next steps:");
console.log(`  cd ${target}`);
console.log("  pnpm install");
console.log("  pnpm build");
console.log("  pnpm test --update-snapshots   # first time: update snapshots");
console.log("  pnpm test                      # verify all pass");
