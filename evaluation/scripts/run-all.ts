#!/usr/bin/env bun
/**
 * Run all evaluation experiments (RQ1 + RQ2 + RQ3).
 *
 * Usage: bun evaluation/scripts/run-all.ts
 */

console.log("AFS-UI Evaluation Suite");
console.log("=======================\n");

console.log("Setting up fixtures...\n");
await import("./setup-fixtures.js");

console.log(`\n${"=".repeat(60)}\n`);
await import("./run-rq1.js");

console.log(`\n${"=".repeat(60)}\n`);
await import("./run-rq2.js");

console.log(`\n${"=".repeat(60)}\n`);
await import("./run-rq3.js");

console.log(`\n${"=".repeat(60)}`);
console.log("\nAll experiments complete. Results in evaluation/results/");
