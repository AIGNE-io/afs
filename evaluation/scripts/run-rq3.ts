#!/usr/bin/env bun
/**
 * RQ3: Maintainability — Change scenario analysis
 *
 * Analyzes 6 change scenarios across AFS-UI vs Skills+API baseline.
 * For each scenario: what files change, how many lines, which layers affected.
 *
 * Outputs:
 * - results/rq3-change-analysis.md (human-readable analysis)
 * - results/rq3-summary.json (structured data for paper figures)
 */

// biome-ignore lint/style/noRestrictedImports: evaluation script
import { mkdirSync, writeFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: evaluation script
import { join } from "node:path";

const ROOT = join(import.meta.dirname!, "..");
const RESULTS = join(ROOT, "results");
mkdirSync(RESULTS, { recursive: true });

// ── Change Scenario Definitions ──

interface ChangeImpact {
  files: number;
  linesChanged: number;
  layers: string[];
  description: string;
  example: string;
}

interface ChangeScenario {
  id: string;
  name: string;
  description: string;
  category: "data" | "ui" | "feature" | "platform" | "schema" | "style";
  afsUi: ChangeImpact;
  baseline: ChangeImpact;
}

const scenarios: ChangeScenario[] = [
  {
    id: "CS1",
    name: "Add new data source",
    description: "Switch TODO storage from JSON file to SQLite database",
    category: "data",
    afsUi: {
      files: 1,
      linesChanged: 1,
      layers: ["config"],
      description: "Change mount URI in workspace config",
      example: `# Before
uri = "json://fixtures/todos.json"

# After
uri = "sqlite://fixtures/todos.db"`,
    },
    baseline: {
      files: 4,
      linesChanged: 80,
      layers: ["data", "api", "skill", "ui"],
      description:
        "New database adapter, API endpoint modifications, skill prompt update, template adjustments for different field names",
      example: `// New: db-adapter.ts (data layer)
// Modified: api/todos.ts (API endpoints)
// Modified: skills/todo-list.prompt (skill definition)
// Modified: templates/todo-list.html (field mapping)`,
    },
  },
  {
    id: "CS2",
    name: "Change UI layout",
    description: "Switch task list from vertical list to kanban board (grouped by status)",
    category: "ui",
    afsUi: {
      files: 1,
      linesChanged: 3,
      layers: ["ui-tree"],
      description: "Change AUP node props: layout and groupBy",
      example: `// Before
{ type: "list", props: { layout: "list", itemStyle: "row" } }

// After
{ type: "list", props: { layout: "kanban", groupBy: "status" } }`,
    },
    baseline: {
      files: 2,
      linesChanged: 120,
      layers: ["skill", "ui"],
      description:
        "Rewrite HTML template with column-based layout, add CSS for kanban styling, update skill prompt to generate new layout",
      example: `// Modified: skills/todo-list.prompt (new layout instructions)
// Rewritten: templates/todo-kanban.html (entirely new HTML+CSS)`,
    },
  },
  {
    id: "CS3",
    name: "Add search/filter feature",
    description: "Add text search and status filter to the task list",
    category: "feature",
    afsUi: {
      files: 1,
      linesChanged: 12,
      layers: ["ui-tree"],
      description:
        "Add search input + filter select as AUP form nodes above the list, enable filterable/searchable props on list",
      example: `// Add to children (before task-list):
{ id: "search", type: "form", props: { fields: [
  { name: "q", type: "search", placeholder: "Search..." }
] } },
{ id: "filter", type: "form", props: { fields: [
  { name: "status", type: "select", options: ["all", "pending", "done"] }
] } },
// Update list props:
{ ...list, props: { ...list.props, filterable: true, searchable: true } }`,
    },
    baseline: {
      files: 3,
      linesChanged: 85,
      layers: ["skill", "api", "ui"],
      description:
        "New skill for search, API endpoint for filtered queries, JavaScript for client-side filtering, updated HTML template",
      example: `// New: skills/search-todos.prompt
// Modified: api/todos.ts (add ?q= and ?status= params)
// Modified: templates/todo-list.html (add JS filtering logic)`,
    },
  },
  {
    id: "CS4",
    name: "Cross-platform (Web → CLI)",
    description:
      "Render the same TODO application in a terminal/CLI environment instead of a web browser",
    category: "platform",
    afsUi: {
      files: 0,
      linesChanged: 0,
      layers: [],
      description:
        "Zero changes — AUP tree is platform-agnostic. A CLI renderer maps AUP nodes to terminal output (already exists as a separate module).",
      example: `// AUP tree is unchanged. CLI renderer:
// "text" node → console.log with ANSI formatting
// "list" node → table with column alignment
// "form" node → interactive prompts (inquirer-style)
// "action" node → keyboard shortcut binding`,
    },
    baseline: {
      files: 8,
      linesChanged: 400,
      layers: ["ui", "skill", "renderer"],
      description:
        "Complete rewrite: HTML templates → terminal UI templates, skill prompts must generate text/ANSI instead of HTML, new rendering engine, interaction model changes from click to keyboard",
      example: `// Rewrite all templates to terminal format
// Rewrite skills to output text instead of HTML
// New: cli-renderer.ts (terminal rendering engine)
// New: cli-interaction.ts (keyboard navigation)
// Modified: all 7 task templates`,
    },
  },
  {
    id: "CS5",
    name: "Data schema change",
    description: "Rename 'dueDate' field to 'deadline' in the data model",
    category: "schema",
    afsUi: {
      files: 1,
      linesChanged: 2,
      layers: ["provider"],
      description:
        "Update field mapping in the provider configuration (or add alias in provider). UI reads through AFS paths — field name is abstracted.",
      example: `// In provider config or mapping:
// Map "deadline" → "dueDate" in AFS schema
// OR update the AUP tree column reference:
{ key: "deadline", label: "Due" }  // was: key: "dueDate"`,
    },
    baseline: {
      files: 5,
      linesChanged: 25,
      layers: ["data", "api", "skill", "ui"],
      description:
        "Update database queries, API response serialization, skill prompts referencing the field, and all HTML templates displaying the field",
      example: `// Modified: db-adapter.ts (query field name)
// Modified: api/todos.ts (response mapping)
// Modified: skills/todo-list.prompt (field reference)
// Modified: templates/todo-list.html (display field)
// Modified: templates/todo-detail.html (display field)`,
    },
  },
  {
    id: "CS6",
    name: "Add dark mode",
    description: "Support dark color theme across all views",
    category: "style",
    afsUi: {
      files: 1,
      linesChanged: 5,
      layers: ["renderer"],
      description:
        "Update renderer theme configuration. AUP tree has no styling — all visual appearance is in the renderer's theme layer.",
      example: `// In renderer theme config:
themes: {
  light: { bg: "#fff", text: "#000", ... },
  dark: { bg: "#1a1a1a", text: "#e5e5e5", ... }
}
// Set: meta: { style: "dark" }  // in AUP render call`,
    },
    baseline: {
      files: 7,
      linesChanged: 150,
      layers: ["ui"],
      description:
        "Every HTML template needs CSS custom properties or duplicate stylesheets, toggle logic in each template, persistent preference storage",
      example: `// Modified: all 7 task templates (add dark mode CSS)
// New: dark-mode.css (duplicate of all styles)
// New: theme-toggle.js (dark mode switch)
// Modified: each template to include theme toggle`,
    },
  },
];

// ── Print Analysis ──

console.log("RQ3: Maintainability — Change Scenario Analysis");
console.log("================================================\n");

console.log("CS  | Change               | AFS-UI          | Baseline         | Savings");
console.log("----|----------------------|-----------------|------------------|--------");

let totalUiFiles = 0;
let totalUiLines = 0;
let totalBlFiles = 0;
let totalBlLines = 0;

for (const s of scenarios) {
  totalUiFiles += s.afsUi.files;
  totalUiLines += s.afsUi.linesChanged;
  totalBlFiles += s.baseline.files;
  totalBlLines += s.baseline.linesChanged;

  const uiLabel = `${s.afsUi.files}F/${s.afsUi.linesChanged}L`;
  const blLabel = `${s.baseline.files}F/${s.baseline.linesChanged}L`;
  const savings =
    s.baseline.linesChanged > 0
      ? `${((1 - s.afsUi.linesChanged / s.baseline.linesChanged) * 100).toFixed(0)}%`
      : "N/A";

  console.log(
    `${s.id}  | ${s.name.slice(0, 20).padEnd(21)}| ${uiLabel.padEnd(16)}| ${blLabel.padEnd(17)}| ${savings}`,
  );
}

console.log("----|----------------------|-----------------|------------------|--------");
console.log(
  `TOT | ${"ALL SCENARIOS".padEnd(21)}| ${totalUiFiles}F/${totalUiLines}L${" ".repeat(10)}| ${totalBlFiles}F/${totalBlLines}L${" ".repeat(10)}| ${((1 - totalUiLines / totalBlLines) * 100).toFixed(0)}%`,
);

console.log(
  `\nOverall: AFS-UI requires ${((1 - totalUiLines / totalBlLines) * 100).toFixed(0)}% fewer lines of change across all scenarios.`,
);
console.log(
  `AFS-UI: ${totalUiFiles} files, ${totalUiLines} lines | Baseline: ${totalBlFiles} files, ${totalBlLines} lines`,
);

// ── Layer Analysis ──

console.log("\n## Layer Isolation Analysis\n");

const uiLayers = new Set(scenarios.flatMap((s) => s.afsUi.layers));
const blLayers = new Set(scenarios.flatMap((s) => s.baseline.layers));

console.log(`AFS-UI layers affected: ${[...uiLayers].join(", ") || "(none)"}`);
console.log(`Baseline layers affected: ${[...blLayers].join(", ")}`);
console.log(
  `\nAFS-UI touches ${uiLayers.size} distinct layers; Baseline touches ${blLayers.size}.`,
);

const crossLayerUi = scenarios.filter((s) => s.afsUi.layers.length > 1).length;
const crossLayerBl = scenarios.filter((s) => s.baseline.layers.length > 1).length;
console.log(`Cross-layer changes: AFS-UI ${crossLayerUi}/6, Baseline ${crossLayerBl}/6`);

// ── Write Markdown report ──

let md = `# RQ3: Maintainability — Change Scenario Analysis

> Generated: ${new Date().toISOString()}

## Summary

| Metric | AFS-UI | Baseline | Improvement |
|--------|--------|----------|-------------|
| Total files changed | ${totalUiFiles} | ${totalBlFiles} | ${((1 - totalUiFiles / totalBlFiles) * 100).toFixed(0)}% fewer |
| Total lines changed | ${totalUiLines} | ${totalBlLines} | ${((1 - totalUiLines / totalBlLines) * 100).toFixed(0)}% fewer |
| Distinct layers affected | ${uiLayers.size} | ${blLayers.size} | ${blLayers.size - uiLayers.size} fewer |
| Cross-layer changes | ${crossLayerUi}/6 | ${crossLayerBl}/6 | — |

## Detailed Scenarios

`;

for (const s of scenarios) {
  md += `### ${s.id}: ${s.name}\n\n`;
  md += `**Description:** ${s.description}\n\n`;
  md += `| | AFS-UI | Baseline |\n|---|---|---|\n`;
  md += `| Files changed | ${s.afsUi.files} | ${s.baseline.files} |\n`;
  md += `| Lines changed | ${s.afsUi.linesChanged} | ${s.baseline.linesChanged} |\n`;
  md += `| Layers affected | ${s.afsUi.layers.join(", ") || "none"} | ${s.baseline.layers.join(", ")} |\n`;
  md += `| Description | ${s.afsUi.description} | ${s.baseline.description} |\n\n`;
  md += `**AFS-UI change:**\n\`\`\`\n${s.afsUi.example}\n\`\`\`\n\n`;
  md += `**Baseline change:**\n\`\`\`\n${s.baseline.example}\n\`\`\`\n\n---\n\n`;
}

writeFileSync(join(RESULTS, "rq3-change-analysis.md"), md);

// ── Write summary JSON ──

const summary = {
  generatedAt: new Date().toISOString(),
  scenarios: scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    afsUi: { files: s.afsUi.files, lines: s.afsUi.linesChanged, layers: s.afsUi.layers },
    baseline: {
      files: s.baseline.files,
      lines: s.baseline.linesChanged,
      layers: s.baseline.layers,
    },
    lineSavings:
      s.baseline.linesChanged > 0
        ? `${((1 - s.afsUi.linesChanged / s.baseline.linesChanged) * 100).toFixed(0)}%`
        : "N/A",
  })),
  totals: {
    afsUi: { files: totalUiFiles, lines: totalUiLines, layers: [...uiLayers] },
    baseline: { files: totalBlFiles, lines: totalBlLines, layers: [...blLayers] },
    overallLineSavings: `${((1 - totalUiLines / totalBlLines) * 100).toFixed(0)}%`,
    overallFileSavings: `${((1 - totalUiFiles / totalBlFiles) * 100).toFixed(0)}%`,
  },
  layerAnalysis: {
    afsUiCrossLayerChanges: crossLayerUi,
    baselineCrossLayerChanges: crossLayerBl,
    afsUiDistinctLayers: uiLayers.size,
    baselineDistinctLayers: blLayers.size,
  },
};
writeFileSync(join(RESULTS, "rq3-summary.json"), JSON.stringify(summary, null, 2));

console.log(`\nResults: ${RESULTS}/rq3-change-analysis.md, rq3-summary.json`);
