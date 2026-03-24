#!/usr/bin/env bun
/**
 * ASH Conformance Test Runner (TypeScript baseline)
 *
 * Reads YAML fixtures from fixtures/ and executes each against the ASH compiler+runtime.
 * Usage: cd conformance/ash-conformance && bun run runner.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JobContext, JobResult, WorldInterface } from "@aigne/ash";
import { compileSource } from "@aigne/ash";
import { parse as parseYaml } from "yaml";

// ── Types ──

interface MockWorld {
  read?: Record<string, unknown[]>;
}

interface JobExpectation {
  name: string;
  expected: FixtureExpected;
}

interface FixtureExpected {
  status: "ok" | "error" | "partial";
  recordCount: number;
  writes?: Record<string, unknown[]>;
  publishes?: Record<string, unknown[]>;
  execs?: Record<string, unknown[]>;
  stream?: unknown[];
}

interface Fixture {
  name: string;
  script: string;
  mockWorld: MockWorld;
  expected?: FixtureExpected;
  jobs?: JobExpectation[];
}

// ── Deep comparison ──

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual(aObj[k], bObj[k]));
  }
  return false;
}

function describeDiff(label: string, expected: unknown, actual: unknown): string {
  return `  ${label}:\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`;
}

// ── Mock world factory ──

interface CapturedIO {
  writes: Map<string, unknown[]>;
  publishes: Map<string, unknown[]>;
  execs: Map<string, unknown[]>;
  lastStream: unknown[];
}

function createMockWorld(mockDef: MockWorld): { world: WorldInterface; captured: CapturedIO } {
  const captured: CapturedIO = {
    writes: new Map(),
    publishes: new Map(),
    execs: new Map(),
    lastStream: [],
  };

  const world: WorldInterface = {
    read(path: string): unknown[] {
      const data = mockDef.read?.[path];
      return data ? JSON.parse(JSON.stringify(data)) : [];
    },
    write(path: string, data: unknown[]): void {
      captured.writes.set(path, data);
    },
    publish(topic: string, data: unknown[]): void {
      captured.publishes.set(topic, data);
    },
    async exec(
      path: string,
      input: unknown[],
      params?: Record<string, unknown>,
    ): Promise<unknown[]> {
      const existing = captured.execs.get(path) ?? [];
      existing.push({ input, params });
      captured.execs.set(path, existing);
      return [];
    },
    input(_prompt: string): string {
      return "";
    },
  };

  return { world, captured };
}

function createJobContext(world: WorldInterface): JobContext {
  return {
    world,
    caps: new Set<string>(["*"]),
    logger: {
      log: () => {},
    },
  };
}

// ── Single job test ──

interface TestFailure {
  field: string;
  expected: unknown;
  actual: unknown;
}

function verifyResult(
  result: JobResult,
  expected: FixtureExpected,
  captured: CapturedIO,
): TestFailure[] {
  const failures: TestFailure[] = [];

  if (result.status !== expected.status) {
    failures.push({ field: "status", expected: expected.status, actual: result.status });
  }

  if (result.recordCount !== expected.recordCount) {
    failures.push({
      field: "recordCount",
      expected: expected.recordCount,
      actual: result.recordCount,
    });
  }

  if (expected.writes) {
    for (const [path, expectedData] of Object.entries(expected.writes)) {
      const actualData = captured.writes.get(path);
      if (!actualData) {
        failures.push({
          field: `writes["${path}"]`,
          expected: expectedData,
          actual: undefined,
        });
      } else if (!deepEqual(actualData, expectedData)) {
        failures.push({
          field: `writes["${path}"]`,
          expected: expectedData,
          actual: actualData,
        });
      }
    }
  }

  if (expected.publishes) {
    for (const [topic, expectedData] of Object.entries(expected.publishes)) {
      const actualData = captured.publishes.get(topic);
      if (!actualData) {
        failures.push({
          field: `publishes["${topic}"]`,
          expected: expectedData,
          actual: undefined,
        });
      } else if (!deepEqual(actualData, expectedData)) {
        failures.push({
          field: `publishes["${topic}"]`,
          expected: expectedData,
          actual: actualData,
        });
      }
    }
  }

  if (expected.stream) {
    if (!deepEqual(captured.lastStream, expected.stream)) {
      failures.push({ field: "stream", expected: expected.stream, actual: captured.lastStream });
    }
  }

  return failures;
}

// ── Main ──

async function main(): Promise<void> {
  const fixturesDir = join(import.meta.dir, "fixtures");
  const files = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  if (files.length === 0) {
    console.error("No fixtures found in", fixturesDir);
    process.exit(1);
  }

  console.log(`\nASH Conformance Tests (${files.length} fixtures)\n${"=".repeat(50)}\n`);

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const content = readFileSync(join(fixturesDir, file), "utf-8");
    const fixture = parseYaml(content) as Fixture;

    // Compile
    const compileResult = compileSource(fixture.script);
    if (!compileResult.program) {
      const errors = compileResult.diagnostics.map((d) => d.message).join("; ");
      console.log(`  FAIL  ${file}: ${fixture.name}`);
      console.log(`    Compile error: ${errors}\n`);
      failed++;
      continue;
    }

    const program = compileResult.program;

    // Multi-job fixture
    if (fixture.jobs) {
      let allPassed = true;
      for (const jobDef of fixture.jobs) {
        const job = program.jobMap.get(jobDef.name);
        if (!job) {
          console.log(`  FAIL  ${file}: ${fixture.name} [job: ${jobDef.name}]`);
          console.log(`    Job "${jobDef.name}" not found in compiled program\n`);
          allPassed = false;
          continue;
        }

        const { world, captured } = createMockWorld(fixture.mockWorld);
        const ctx = createJobContext(world);

        // Wrap world to capture stream
        const origWrite = world.write.bind(world);
        world.write = (path: string, data: unknown[]) => {
          captured.lastStream = data;
          origWrite(path, data);
        };

        const result = await job.execute(ctx);
        // If no terminal stage consumed the stream, lastStream stays empty;
        // set it from recordCount context (the result reflects final stream length)
        if (captured.lastStream.length === 0 && result.recordCount > 0) {
          // We don't have the actual stream here — only verify status/recordCount
        }

        const failures = verifyResult(result, jobDef.expected, captured);
        if (failures.length > 0) {
          console.log(`  FAIL  ${file}: ${fixture.name} [job: ${jobDef.name}]`);
          for (const f of failures) {
            console.log(describeDiff(f.field, f.expected, f.actual));
          }
          console.log();
          allPassed = false;
        }
      }
      if (allPassed) {
        console.log(`  PASS  ${file}: ${fixture.name}`);
        passed++;
      } else {
        failed++;
      }
      continue;
    }

    // Single-job fixture (run first job)
    const job = program.jobs[0];
    if (!job) {
      console.log(`  FAIL  ${file}: ${fixture.name}`);
      console.log(`    No jobs found in compiled program\n`);
      failed++;
      continue;
    }

    const { world, captured } = createMockWorld(fixture.mockWorld);
    const ctx = createJobContext(world);

    // Intercept to capture the final stream for stream verification
    // We need to capture what the pipeline produces before terminal stages consume it.
    // For stream verification, we wrap the world to track the last write.
    const origWrite = world.write.bind(world);
    world.write = (path: string, data: unknown[]) => {
      captured.lastStream = data;
      origWrite(path, data);
    };
    const origPublish = world.publish.bind(world);
    world.publish = (topic: string, data: unknown[]) => {
      captured.lastStream = data;
      origPublish(topic, data);
    };

    const result = await job.execute(ctx);

    // For fixtures with stream expectations but no terminal stage,
    // we can't capture the stream this way. We'd need a different approach.
    // For now, handle the case where the pipeline doesn't end with save/publish.

    const expected = fixture.expected!;
    const failures = verifyResult(result, expected, captured);

    if (failures.length > 0) {
      console.log(`  FAIL  ${file}: ${fixture.name}`);
      for (const f of failures) {
        console.log(describeDiff(f.field, f.expected, f.actual));
      }
      if (result.errors.length > 0) {
        console.log(`    runtime errors: ${result.errors.join("; ")}`);
      }
      console.log();
      failed++;
    } else {
      console.log(`  PASS  ${file}: ${fixture.name}`);
      passed++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});
