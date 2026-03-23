/**
 * AFS Conformance Test Suite — Reporter
 *
 * Formats test results for CLI output with colors and summary.
 */

import chalk from "chalk";
import type { TestResult, TestRunSummary } from "./types.js";

/**
 * Print a single test result as it completes.
 */
export function reportTestResult(result: TestResult): void {
  if (result.skipped) {
    console.log(chalk.yellow(`  ⊘ SKIP  ${result.name}`));
    return;
  }

  if (result.passed) {
    console.log(chalk.green(`  ✓ PASS  ${result.name}`) + chalk.gray(` (${result.durationMs}ms)`));
  } else {
    console.log(chalk.red(`  ✗ FAIL  ${result.name}`));
    for (const error of result.errors) {
      console.log(chalk.red(`          ${error}`));
    }
  }
}

/**
 * Print a file header before its tests.
 */
export function reportFileHeader(file: string): void {
  console.log(chalk.bold.cyan(`\n${file}`));
}

/**
 * Print the final summary of the entire test run.
 */
export function reportSummary(summary: TestRunSummary): void {
  console.log(`\n${chalk.bold("━".repeat(60))}`);
  console.log(chalk.bold("  Test Run Summary"));
  console.log(chalk.bold("━".repeat(60)));

  const parts: string[] = [];
  parts.push(chalk.green(`${summary.passed} passed`));
  if (summary.failed > 0) {
    parts.push(chalk.red(`${summary.failed} failed`));
  }
  if (summary.skipped > 0) {
    parts.push(chalk.yellow(`${summary.skipped} skipped`));
  }
  parts.push(chalk.gray(`${summary.total} total`));

  console.log(`  ${parts.join(", ")}`);
  console.log(chalk.gray(`  Duration: ${summary.durationMs}ms`));

  // List failures
  const failures = summary.results.filter((r) => !r.passed && !r.skipped);
  if (failures.length > 0) {
    console.log(chalk.red.bold("\n  Failures:"));
    for (const f of failures) {
      console.log(chalk.red(`    ${f.file} > ${f.name}`));
      for (const err of f.errors) {
        console.log(chalk.red(`      ${err}`));
      }
    }
  }

  console.log(chalk.bold("━".repeat(60)));
}
