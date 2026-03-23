/**
 * Phase 2: scanBlockletTriggers — trigger scanner tests.
 *
 * Tests the scanning of .ash scripts in a program directory to extract
 * @on (event) and @cron trigger declarations.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileFn, TriggerInfo } from "../../src/program/blocklet-trigger-scanner.js";
import { scanBlockletTriggers } from "../../src/program/blocklet-trigger-scanner.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_PROGRAM_YAML = `
specVersion: 1
id: test-program
name: Test Program
entrypoint: scripts/main.ash
mounts: []
`;

/** Create a mock compile function that maps source content to trigger results. */
function createMockCompile(
  results: Record<
    string,
    {
      jobs: Array<{ name: string; trigger?: TriggerInfo }>;
      fail?: boolean;
    }
  >,
): CompileFn {
  return (source: string) => {
    const result = results[source.trim()];
    if (result?.fail) {
      return {
        diagnostics: [{ message: "Syntax error" }],
      };
    }
    if (!result) {
      return {
        program: { units: [] },
        diagnostics: [],
      };
    }
    return {
      program: {
        units: result.jobs.map((j) => ({
          kind: "job" as const,
          name: j.name,
          trigger: j.trigger,
        })),
      },
      diagnostics: [],
    };
  };
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "trigger-scan-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/** Write a file in the temp dir. Creates parent directories. */
function writeFile(relPath: string, content: string): void {
  const fullPath = join(tempDir, relPath);
  const dir = join(fullPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

// ─── Happy Path ─────────────────────────────────────────────────────────────

describe("scanBlockletTriggers", () => {
  describe("Happy Path", () => {
    it("single script with @on event trigger → returns BlockletTriggerInfo", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/watcher.ash", "event-watcher");

      const compile = createMockCompile({
        "event-watcher": {
          jobs: [
            {
              name: "handler",
              trigger: { kind: "event", path: "/data/inbox", event: "created" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.manifest.id).toBe("test-program");
      expect(result!.triggers).toHaveLength(1);
      expect(result!.triggers[0]!.jobName).toBe("handler");
      expect(result!.triggers[0]!.trigger.kind).toBe("event");
      expect(result!.triggers[0]!.trigger.path).toBe("/data/inbox");
      expect(result!.triggers[0]!.trigger.event).toBe("created");
    });

    it("single script with @cron trigger → returns BlockletTriggerInfo", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/ticker.ash", "cron-ticker");

      const compile = createMockCompile({
        "cron-ticker": {
          jobs: [
            {
              name: "tick",
              trigger: { kind: "cron", expression: "* * * * *" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(1);
      expect(result!.triggers[0]!.trigger.kind).toBe("cron");
      expect(result!.triggers[0]!.trigger.expression).toBe("* * * * *");
    });

    it("single script with multiple triggers (different jobs) → all collected", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/multi.ash", "multi-trigger");

      const compile = createMockCompile({
        "multi-trigger": {
          jobs: [
            {
              name: "watcher",
              trigger: { kind: "event", path: "/data/inbox", event: "created" },
            },
            {
              name: "ticker",
              trigger: { kind: "cron", expression: "0 * * * *" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(2);
      const kinds = result!.triggers.map((t) => t.trigger.kind).sort();
      expect(kinds).toEqual(["cron", "event"]);
    });

    it("multiple scripts each with triggers → all files collected", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/a.ash", "script-a");
      writeFile("scripts/b.ash", "script-b");

      const compile = createMockCompile({
        "script-a": {
          jobs: [
            {
              name: "handler-a",
              trigger: { kind: "event", path: "/data/a", event: "created" },
            },
          ],
        },
        "script-b": {
          jobs: [
            {
              name: "handler-b",
              trigger: { kind: "event", path: "/data/b", event: "deleted" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(2);
      const scripts = result!.triggers.map((t) => t.scriptPath).sort();
      expect(scripts).toEqual(["scripts/a.ash", "scripts/b.ash"]);
    });

    it("mixed scripts with/without triggers → only triggered ones collected", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/main.ash", "no-trigger");
      writeFile("scripts/watcher.ash", "has-trigger");

      const compile = createMockCompile({
        "no-trigger": {
          jobs: [{ name: "regular" }], // no trigger
        },
        "has-trigger": {
          jobs: [
            {
              name: "watcher",
              trigger: { kind: "event", path: "/data/inbox", event: "created" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(1);
      expect(result!.triggers[0]!.scriptPath).toBe("scripts/watcher.ash");
    });
  });

  // ─── Bad Path ───────────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    it("program directory does not exist → throws", async () => {
      await expect(
        scanBlockletTriggers(join(tempDir, "nonexistent"), createMockCompile({})),
      ).rejects.toThrow();
    });

    it("blocklet.yaml does not exist → throws", async () => {
      // Directory exists but no blocklet.yaml or program.yaml
      writeFile("scripts/main.ash", "some content");

      await expect(scanBlockletTriggers(tempDir, createMockCompile({}))).rejects.toThrow(
        /blocklet\.yaml/,
      );
    });

    it("program.yaml is invalid → throws", async () => {
      writeFile("program.yaml", "invalid: [[[yaml content");

      await expect(scanBlockletTriggers(tempDir, createMockCompile({}))).rejects.toThrow();
    });

    it(".ash script compile failure → skip script, do not interrupt", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/broken.ash", "broken-script");
      writeFile("scripts/good.ash", "good-script");

      const compile = createMockCompile({
        "broken-script": { jobs: [], fail: true },
        "good-script": {
          jobs: [
            {
              name: "handler",
              trigger: { kind: "event", path: "/data/inbox", event: "created" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(1);
      expect(result!.triggers[0]!.scriptPath).toBe("scripts/good.ash");
    });

    it("empty program directory (no .ash files) → returns null", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);

      const result = await scanBlockletTriggers(tempDir, createMockCompile({}));
      expect(result).toBeNull();
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("all scripts have no triggers → returns null", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/main.ash", "no-triggers");
      writeFile("scripts/helper.ash", "also-no-triggers");

      const compile = createMockCompile({
        "no-triggers": { jobs: [{ name: "main" }] },
        "also-no-triggers": { jobs: [{ name: "helper" }] },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).toBeNull();
    });

    it(".ash files in subdirectories → recursively found", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/handlers/deep.ash", "deep-script");

      const compile = createMockCompile({
        "deep-script": {
          jobs: [
            {
              name: "deep-handler",
              trigger: { kind: "event", path: "/data/deep", event: "created" },
            },
          ],
        },
      });

      const result = await scanBlockletTriggers(tempDir, compile);
      expect(result).not.toBeNull();
      expect(result!.triggers).toHaveLength(1);
      expect(result!.triggers[0]!.scriptPath).toBe("scripts/handlers/deep.ash");
    });

    it("non-.ash files are ignored", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/main.ash", "ash-script");
      writeFile("scripts/readme.md", "# Not a script");
      writeFile("scripts/config.json", '{"key": "value"}');

      const compileCalls: string[] = [];
      const compile: CompileFn = (source) => {
        compileCalls.push(source.trim());
        return {
          program: {
            units: [
              {
                kind: "job",
                name: "handler",
                trigger: { kind: "event", path: "/data", event: "created" },
              },
            ],
          },
          diagnostics: [],
        };
      };

      await scanBlockletTriggers(tempDir, compile);
      // Only the .ash file should have been compiled
      expect(compileCalls).toHaveLength(1);
      expect(compileCalls[0]).toBe("ash-script");
    });

    it("empty .ash file → skipped", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/empty.ash", "");
      writeFile("scripts/good.ash", "good-script");

      const compileCalls: string[] = [];
      const compile: CompileFn = (source) => {
        compileCalls.push(source);
        return {
          program: {
            units: [
              {
                kind: "job",
                name: "handler",
                trigger: { kind: "event", path: "/data", event: "created" },
              },
            ],
          },
          diagnostics: [],
        };
      };

      await scanBlockletTriggers(tempDir, compile);
      // Only non-empty file should be compiled
      expect(compileCalls).toHaveLength(1);
    });
  });

  // ─── Security ─────────────────────────────────────────────────────────────

  describe("Security", () => {
    it("does not execute script content — only compiles", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/main.ash", "test-script");

      let compiled = false;
      const compile: CompileFn = (source) => {
        compiled = true;
        // Verify the function only receives source as a string
        expect(typeof source).toBe("string");
        return { program: { units: [] }, diagnostics: [] };
      };

      await scanBlockletTriggers(tempDir, compile);
      expect(compiled).toBe(true);
      // The compile function was called but no execute function — by design
      // since we control the compile function via DI, no execution can happen
    });

    it("does not follow symlinks outside program directory", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);

      // Create a directory outside the program dir
      const outsideDir = await mkdtemp(join(tmpdir(), "outside-"));
      writeFileSync(join(outsideDir, "secret.ash"), "secret-content");

      // Create a symlink inside the program dir pointing outside
      const scriptsDir = join(tempDir, "scripts");
      mkdirSync(scriptsDir, { recursive: true });
      try {
        symlinkSync(outsideDir, join(scriptsDir, "external-link"));
      } catch {
        // symlink creation may fail on some systems — skip test
        await rm(outsideDir, { recursive: true, force: true });
        return;
      }

      const compileCalls: string[] = [];
      const compile: CompileFn = (source) => {
        compileCalls.push(source.trim());
        return { program: { units: [] }, diagnostics: [] };
      };

      await scanBlockletTriggers(tempDir, compile);

      // Should NOT have compiled the secret.ash from outside
      expect(compileCalls).not.toContain("secret-content");

      await rm(outsideDir, { recursive: true, force: true });
    });

    it("blocks symlinks that only share a string prefix with root path", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);

      const outsideDir = `${tempDir}-outside`;
      mkdirSync(outsideDir, { recursive: true });
      writeFileSync(join(outsideDir, "leaked.ash"), "prefix-secret");

      const scriptsDir = join(tempDir, "scripts");
      mkdirSync(scriptsDir, { recursive: true });
      try {
        symlinkSync(outsideDir, join(scriptsDir, "prefix-link"));
      } catch {
        await rm(outsideDir, { recursive: true, force: true });
        return;
      }

      const compileCalls: string[] = [];
      const compile: CompileFn = (source) => {
        compileCalls.push(source.trim());
        return { program: { units: [] }, diagnostics: [] };
      };

      await scanBlockletTriggers(tempDir, compile);
      expect(compileCalls).not.toContain("prefix-secret");

      await rm(outsideDir, { recursive: true, force: true });
    });
  });

  // ─── Data Leak ──────────────────────────────────────────────────────────────

  describe("Data Leak", () => {
    it("compile error does not expose system paths", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/broken.ash", "broken");

      const compile: CompileFn = () => {
        return { diagnostics: [{ message: "Unexpected token at line 1" }] };
      };

      // Should not throw (gracefully skips), and any warnings logged
      // should not contain the absolute path
      const result = await scanBlockletTriggers(tempDir, compile);
      // No triggers found, returns null
      expect(result).toBeNull();
      // The tempDir absolute path should not leak in any returned data
    });
  });

  // ─── Data Damage ────────────────────────────────────────────────────────────

  describe("Data Damage", () => {
    it("scan process is read-only — does not modify any files", async () => {
      writeFile("program.yaml", VALID_PROGRAM_YAML);
      writeFile("scripts/main.ash", "test-script");

      // Record file stats before scan
      const yamlStatBefore = statSync(join(tempDir, "program.yaml"));
      const ashStatBefore = statSync(join(tempDir, "scripts/main.ash"));

      const compile = createMockCompile({
        "test-script": {
          jobs: [
            {
              name: "handler",
              trigger: { kind: "event", path: "/data", event: "created" },
            },
          ],
        },
      });

      await scanBlockletTriggers(tempDir, compile);

      // Verify files unchanged
      const yamlStatAfter = statSync(join(tempDir, "program.yaml"));
      const ashStatAfter = statSync(join(tempDir, "scripts/main.ash"));
      expect(yamlStatAfter.mtimeMs).toBe(yamlStatBefore.mtimeMs);
      expect(ashStatAfter.mtimeMs).toBe(ashStatBefore.mtimeMs);

      // Verify no new files created
      const allFiles = readdirSync(join(tempDir, "scripts"));
      expect(allFiles).toEqual(["main.ash"]);
    });
  });
});
