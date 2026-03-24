#!/usr/bin/env tsx
/**
 * AFS Conformance Test Runner
 *
 * Reads YAML spec files and executes HTTP requests (or WebSocket sessions)
 * against any AFS server to verify protocol compliance.
 *
 * Usage:
 *   npx tsx conformance/src/runner.ts --url http://localhost:8080/rpc --specs conformance/specs/
 *   npx tsx conformance/src/runner.ts --launch --specs conformance/specs/
 *   npx tsx conformance/src/runner.ts --ws-url ws://localhost:8080/ws --specs conformance/specs/l2
 *   npx tsx conformance/src/runner.ts --help
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseAllDocuments } from "yaml";
import { assertDeepMatch } from "./assertions.js";
import { type LaunchResult, launchTestServer } from "./launcher.js";
import { reportFileHeader, reportSummary, reportTestResult } from "./reporter.js";
import type { TestResult, TestRunSummary, TestSpec } from "./types.js";
import { runWsSpec } from "./ws-harness.js";
import type { WsTestSpec } from "./ws-types.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  url?: string;
  wsUrl?: string;
  specs: string;
  launch: boolean;
  fixtures: string;
  filter?: string;
  level: "l1" | "l2" | "l3" | "l4" | "l5" | "l6" | "all";
  help: boolean;
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      url: { type: "string", short: "u" },
      "ws-url": { type: "string", short: "w" },
      specs: { type: "string", short: "s", default: "specs" },
      launch: { type: "boolean", short: "l", default: false },
      fixtures: {
        type: "string",
        short: "f",
        default: "fixtures",
      },
      filter: { type: "string" },
      level: { type: "string", default: "all" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const level = values.level as string;
  const validLevels = ["l1", "l2", "l3", "l4", "l5", "l6", "all"];
  if (!validLevels.includes(level)) {
    console.error(`Error: --level must be one of ${validLevels.join(", ")} (got "${level}")`);
    process.exit(1);
  }

  return {
    url: values.url,
    wsUrl: values["ws-url"],
    specs: values.specs!,
    launch: values.launch!,
    fixtures: values.fixtures!,
    filter: values.filter,
    level: level as "l1" | "l2" | "l3" | "l4" | "l5" | "l6" | "all",
    help: values.help!,
  };
}

function printUsage(): void {
  console.log(`
AFS Conformance Test Runner

Usage:
  npx tsx conformance/src/runner.ts [options]

Options:
  -u, --url <url>         Target AFS server RPC endpoint URL (for HTTP specs)
  -w, --ws-url <url>      Target AFS server WebSocket URL (for AUP/WS specs)
  -s, --specs <dir>       Path to YAML spec files (default: specs)
  -l, --launch            Auto-launch a test server using TS reference implementation
  -f, --fixtures <dir>    Fixtures directory for auto-launched server (default: fixtures)
      --filter <pattern>  Only run specs whose name contains this string
      --level <level>     Run only l1-l6, or all specs (default: all)
  -h, --help              Show this help message

Examples:
  # Test a running server (HTTP RPC)
  npx tsx conformance/src/runner.ts --url http://localhost:8080/rpc

  # Test AUP WebSocket specs
  npx tsx conformance/src/runner.ts --ws-url ws://localhost:8080/ws --specs conformance/specs/l2 --filter aup

  # Auto-launch server and test
  npx tsx conformance/src/runner.ts --launch

  # Test specific specs
  npx tsx conformance/src/runner.ts --url http://localhost:8080/rpc --specs conformance/specs/l1 --filter read
`);
}

// ---------------------------------------------------------------------------
// Spec loading
// ---------------------------------------------------------------------------

/**
 * Recursively find all .yaml/.yml files in a directory.
 */
function findSpecFiles(dir: string): string[] {
  const absDir = resolve(dir);
  const files: string[] = [];

  function walk(d: string): void {
    const entries = readdirSync(d);
    for (const entry of entries) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
        files.push(full);
      }
    }
  }

  walk(absDir);
  files.sort();
  return files;
}

/** A parsed spec is either an HTTP TestSpec or a WebSocket WsTestSpec. */
type AnySpec = TestSpec | WsTestSpec;

function isWsSpec(spec: AnySpec): spec is WsTestSpec {
  return (spec as WsTestSpec).transport === "ws";
}

/**
 * Parse a YAML spec file into test cases.
 * Supports multi-document YAML (--- separators).
 * Returns a mix of HTTP and WS specs — the runner dispatches accordingly.
 */
function parseSpecFile(filePath: string): AnySpec[] {
  const content = readFileSync(filePath, "utf-8");
  const docs = parseAllDocuments(content);
  const specs: AnySpec[] = [];

  for (const doc of docs) {
    if (doc.errors.length > 0) {
      console.error(`YAML parse error in ${filePath}:`, doc.errors);
      continue;
    }
    const value = doc.toJS();
    if (value && typeof value === "object" && value.name) {
      specs.push(value as AnySpec);
    }
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------

/**
 * Build the JSON-RPC request body from operation and params.
 */
function buildRpcRequest(
  operation: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    method: operation,
    params,
  };
}

/**
 * Send a JSON-RPC request to the target server.
 */
async function sendRpcRequest(
  url: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const responseBody = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: responseBody };
}

/**
 * Validate a response against an ExpectBlock and return errors.
 */
function validateExpect(
  responseBody: Record<string, unknown>,
  expect: import("./types.js").ExpectBlock,
  pathPrefix: string,
): string[] {
  const errors: string[] = [];

  // Validate success field
  if (expect.success !== undefined) {
    if (responseBody.success !== expect.success) {
      errors.push(`${pathPrefix}success: expected ${expect.success}, got ${responseBody.success}`);
    }
  }

  // Validate error block (for failure cases)
  if (expect.success === false && expect.error) {
    const actualError = responseBody.error as Record<string, unknown> | undefined;
    if (!actualError) {
      errors.push(`${pathPrefix}expected error object in response, but none found`);
    } else {
      const matchErrors = assertDeepMatch(actualError, expect.error, `${pathPrefix}$.error`);
      errors.push(...matchErrors);
    }
  }

  // Validate data block (for success cases)
  if (expect.success === true && expect.data !== undefined) {
    const actualData = responseBody.data;
    if (actualData === undefined && expect.data !== undefined) {
      errors.push(`${pathPrefix}expected data in response, but got undefined`);
    } else {
      const matchErrors = assertDeepMatch(actualData, expect.data, `${pathPrefix}$.data`);
      errors.push(...matchErrors);
    }
  }

  // For failed responses, validate data if expect has data even on failure
  if (expect.success === false && expect.data !== undefined) {
    const matchErrors = assertDeepMatch(responseBody.data, expect.data, `${pathPrefix}$.data`);
    errors.push(...matchErrors);
  }

  return errors;
}

/**
 * Interpolate ${variable} references in params using the store map.
 */
function interpolateParams(
  params: Record<string, unknown>,
  store: Record<string, unknown>,
): Record<string, unknown> {
  function interpolateValue(val: unknown): unknown {
    if (typeof val === "string") {
      // Replace ${varName} with stored value
      return val.replace(/\$\{(\w+)\}/g, (_match, key: string) => {
        const stored = store[key];
        return stored !== undefined ? String(stored) : `\${${key}}`;
      });
    }
    if (Array.isArray(val)) {
      return val.map(interpolateValue);
    }
    if (val !== null && typeof val === "object") {
      return interpolateParams(val as Record<string, unknown>, store);
    }
    return val;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = interpolateValue(value);
  }
  return result;
}

/**
 * Extract a value from an object using a simple JSON path (e.g. "$.data.data.path").
 */
function extractByPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Run an L2 multi-step spec against the target server.
 */
async function runMultiStepSpec(url: string, spec: TestSpec, file: string): Promise<TestResult> {
  const steps = spec.steps!;
  const start = performance.now();
  const errors: string[] = [];
  const store: Record<string, unknown> = {};

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepLabel = step.name || `step ${i + 1}`;

    try {
      const params = interpolateParams(step.params, store);
      const rpcBody = buildRpcRequest(step.operation, params);
      const response = await sendRpcRequest(url, rpcBody);
      const { body: responseBody } = response;

      // Validate expect if present
      if (step.expect) {
        const stepErrors = validateExpect(responseBody, step.expect, `${stepLabel}: `);
        if (stepErrors.length > 0) {
          errors.push(...stepErrors);
          break; // Stop on first step failure
        }
      }

      // Extract store values
      if (step.store) {
        for (const [varName, jsonPath] of Object.entries(step.store)) {
          store[varName] = extractByPath(responseBody, jsonPath);
        }
      }
    } catch (error) {
      errors.push(
        `${stepLabel}: Request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
  }

  const durationMs = Math.round(performance.now() - start);

  return {
    name: spec.name,
    file,
    passed: errors.length === 0,
    durationMs,
    errors,
    skipped: false,
  };
}

/**
 * Run a single test spec against the target server (L1 or L2).
 */
async function runSpec(url: string, spec: TestSpec, file: string): Promise<TestResult> {
  if (spec.skip) {
    return {
      name: spec.name,
      file,
      passed: true,
      durationMs: 0,
      errors: [],
      skipped: true,
    };
  }

  // L2: multi-step spec
  if (spec.steps && spec.steps.length > 0) {
    return runMultiStepSpec(url, spec, file);
  }

  // L1: single operation spec
  if (!spec.operation || !spec.expect) {
    return {
      name: spec.name,
      file,
      passed: false,
      durationMs: 0,
      errors: ["spec must have either 'operation'+'expect' (L1) or 'steps' (L2)"],
      skipped: false,
    };
  }

  const start = performance.now();
  const errors: string[] = [];

  try {
    const rpcBody = buildRpcRequest(spec.operation, spec.params || {});
    const response = await sendRpcRequest(url, rpcBody);
    const { body: responseBody } = response;

    errors.push(...validateExpect(responseBody, spec.expect, ""));
  } catch (error) {
    errors.push(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const durationMs = Math.round(performance.now() - start);

  return {
    name: spec.name,
    file,
    passed: errors.length === 0,
    durationMs,
    errors,
    skipped: false,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  // Determine server URL
  let url = opts.url;
  let launchResult: LaunchResult | undefined;

  // Core servers (L3/L4/L6 share one, L5 needs separate security-configured servers)
  let coreUrl: string | undefined;
  let coreLaunchResult: LaunchResult | undefined;
  let l5PolicyUrl: string | undefined;
  let l5PolicyLaunchResult: LaunchResult | undefined;
  let l5BlockedUrl: string | undefined;
  let l5BlockedLaunchResult: LaunchResult | undefined;

  const level = opts.level;
  const needsL1L2 = level === "l1" || level === "l2" || level === "all";
  const needsCore = ["l3", "l4", "l6", "all"].includes(level);
  const needsL5 = level === "l5" || level === "all";

  if (opts.launch) {
    const l3FixturesDir = join(resolve(opts.fixtures), "..", "fixtures-l3");

    // Launch L1/L2 server (single provider)
    if (needsL1L2) {
      console.log("Launching L1/L2 test server (single provider)...");
      try {
        launchResult = await launchTestServer({
          fixturesDir: opts.fixtures,
          writable: true,
        });
        url = launchResult.url;
        console.log(`  L1/L2 server running at ${url}`);
      } catch (error) {
        console.error(
          "Failed to launch test server:",
          error instanceof Error ? error.message : error,
        );
        console.error("\nMake sure @aigne/afs-fs and @aigne/afs-http are installed.");
        process.exit(1);
      }
    }

    // Launch core server (L3/L4/L6: AFS compositor with multiple mounts)
    if (needsCore) {
      console.log("Launching core test server (AFS compositor, multi-mount)...");
      try {
        coreLaunchResult = await launchTestServer({
          fixturesDir: l3FixturesDir,
          writable: true,
          mounts: {
            "/alpha": "provider-a",
            "/beta": "provider-b",
          },
        });
        coreUrl = coreLaunchResult.url;
        console.log(`  Core server running at ${coreUrl}`);
      } catch (error) {
        console.error(
          "Failed to launch core test server:",
          error instanceof Error ? error.message : error,
        );
        console.error("\nMake sure @aigne/afs, @aigne/afs-fs, and @aigne/afs-http are installed.");
        process.exit(1);
      }
    }

    // Launch L5 servers (security tests need specific configs)
    if (needsL5) {
      console.log("Launching L5 test servers (security configs)...");
      try {
        // L5-policy: actionPolicy = "safe" (blocks boundary/critical actions)
        l5PolicyLaunchResult = await launchTestServer({
          fixturesDir: l3FixturesDir,
          writable: true,
          mounts: { "/alpha": "provider-a", "/beta": "provider-b" },
          security: { actionPolicy: "safe" },
        });
        l5PolicyUrl = l5PolicyLaunchResult.url;
        console.log(`  L5-policy server running at ${l5PolicyUrl}`);

        // L5-blocked: blockedActions = ["archive"]
        l5BlockedLaunchResult = await launchTestServer({
          fixturesDir: l3FixturesDir,
          writable: true,
          mounts: { "/alpha": "provider-a", "/beta": "provider-b" },
          security: { blockedActions: ["archive"] },
        });
        l5BlockedUrl = l5BlockedLaunchResult.url;
        console.log(`  L5-blocked server running at ${l5BlockedUrl}`);
      } catch (error) {
        console.error(
          "Failed to launch L5 test servers:",
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    }
    console.log();
  }

  const wsUrl = opts.wsUrl;

  if (!url && !wsUrl && !coreUrl && !l5PolicyUrl) {
    console.error("Error: --url, --ws-url, or --launch is required. Use --help for usage.\n");
    printUsage();
    process.exit(1);
  }

  // Find and parse spec files
  const specsDir = resolve(opts.specs);
  let specFiles: string[];
  try {
    if (opts.level === "all") {
      specFiles = findSpecFiles(specsDir);
    } else {
      const levelDir = join(specsDir, opts.level);
      try {
        specFiles = findSpecFiles(levelDir);
      } catch {
        console.error(`Error: cannot read specs directory "${levelDir}" for level "${opts.level}"`);
        process.exit(1);
      }
    }
  } catch {
    console.error(`Error: cannot read specs directory "${specsDir}"`);
    process.exit(1);
  }

  if (specFiles.length === 0) {
    console.error(`No spec files found in "${specsDir}"`);
    process.exit(1);
  }

  console.log(`Found ${specFiles.length} spec file(s) in ${specsDir}`);
  if (url) console.log(`HTTP Target (L1/L2): ${url}`);
  if (coreUrl) console.log(`HTTP Target (L3/L4/L6): ${coreUrl}`);
  if (l5PolicyUrl) console.log(`HTTP Target (L5-policy): ${l5PolicyUrl}`);
  if (l5BlockedUrl) console.log(`HTTP Target (L5-blocked): ${l5BlockedUrl}`);
  if (wsUrl) console.log(`WS Target: ${wsUrl}`);
  console.log();

  // Run all specs
  const allResults: TestResult[] = [];
  const runStart = performance.now();

  for (const file of specFiles) {
    const relFile = relative(process.cwd(), file);
    const specs = parseSpecFile(file);

    if (specs.length === 0) continue;

    // Apply filter
    const filtered = opts.filter
      ? specs.filter((s) => s.name.toLowerCase().includes(opts.filter!.toLowerCase()))
      : specs;

    if (filtered.length === 0) continue;

    reportFileHeader(relFile);

    for (const spec of filtered) {
      let result: TestResult;

      // Determine which server URL to use based on spec file path
      const specLevel = relFile.match(/[/\\](l[1-6])[/\\]/)?.[1] ?? "";
      let targetUrl: string | undefined;
      if (specLevel === "l5") {
        // L5 specs need security-configured servers
        // Route by filename: blocked-actions → l5BlockedUrl, others → l5PolicyUrl
        const isBlockedSpec = relFile.includes("blocked-actions");
        targetUrl = isBlockedSpec ? (l5BlockedUrl ?? url) : (l5PolicyUrl ?? url);
      } else if (["l3", "l4", "l6"].includes(specLevel)) {
        targetUrl = coreUrl ?? url;
      } else {
        targetUrl = url;
      }

      if (isWsSpec(spec)) {
        // WebSocket / AUP spec
        if (!wsUrl) {
          result = {
            name: spec.name,
            file: relFile,
            passed: true,
            durationMs: 0,
            errors: [],
            skipped: true,
          };
        } else {
          result = await runWsSpec(wsUrl, spec, relFile);
        }
      } else {
        // HTTP RPC spec (L1, L2, or L3)
        if (!targetUrl) {
          result = {
            name: spec.name,
            file: relFile,
            passed: true,
            durationMs: 0,
            errors: [],
            skipped: true,
          };
        } else {
          result = await runSpec(targetUrl, spec, relFile);
        }
      }

      allResults.push(result);
      reportTestResult(result);
    }
  }

  const totalDuration = Math.round(performance.now() - runStart);

  // Summary
  const summary: TestRunSummary = {
    total: allResults.length,
    passed: allResults.filter((r) => r.passed && !r.skipped).length,
    failed: allResults.filter((r) => !r.passed).length,
    skipped: allResults.filter((r) => r.skipped).length,
    durationMs: totalDuration,
    results: allResults,
  };

  reportSummary(summary);

  // Cleanup
  const allLaunched = [launchResult, coreLaunchResult, l5PolicyLaunchResult, l5BlockedLaunchResult];
  for (const result of allLaunched) {
    if (result) await result.close();
  }

  // Exit code
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
