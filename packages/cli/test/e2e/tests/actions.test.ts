/**
 * E2E tests for Action system (.actions paths and exec command)
 *
 * Tests:
 * - Action execution via exec command
 * - Action help via exec --help
 * - All views: human, llm, json
 *
 * Note: ls .actions is tested in ls.test.ts
 *
 * SQLite nodes with .actions:
 * - Tables: export, count, insert
 * - Rows: duplicate, validate
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";

/**
 * Convert path to snapshot-friendly identifier
 */
function pathToId(path: string): string {
  return path.slice(1).replace(/\//g, "-").replace(/\./g, "_");
}

describe("Action system", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  const views = ["human", "llm", "json"];

  // ============================================================
  // Action execution (exec)
  // One representative per action type
  // ============================================================
  describe("Action execution", () => {
    // Table actions: count (no params), export (with params)
    describe("table actions", () => {
      describe.each(views)("view=%s", (view) => {
        test("count action", async () => {
          const path = "/sqlite/users/.actions/count";
          const pathId = pathToId(path);
          const args = view === "json" ? ["exec", path, "--json"] : ["exec", path, "--view", view];
          const result = await cli.run(...args);
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toMatchSnapshot(`exec-${view}-${pathId}`);
        }, 30000);
      });

      // Export action with format parameter
      const formats = ["json", "csv"];
      describe.each(formats)("export format=%s", (format) => {
        test("export action", async () => {
          const path = "/sqlite/users/.actions/export";
          const pathId = pathToId(path);
          const result = await cli.run("exec", path, "--format", format);
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toMatchSnapshot(`exec-export-${format}-${pathId}`);
        }, 30000);
      });
    });

    // Row actions: validate, duplicate
    describe("row actions", () => {
      describe.each(views)("view=%s", (view) => {
        test("validate action", async () => {
          const path = "/sqlite/users/1/.actions/validate";
          const pathId = pathToId(path);
          const args = view === "json" ? ["exec", path, "--json"] : ["exec", path, "--view", view];
          const result = await cli.run(...args);
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toMatchSnapshot(`exec-${view}-${pathId}`);
        }, 30000);
      });
    });
  });

  // ============================================================
  // Action help (exec --help)
  // One representative per action
  // ============================================================
  describe("Action help", () => {
    const helpPaths = [
      { path: "/sqlite/users/.actions/export", name: "table export" },
      { path: "/sqlite/users/.actions/count", name: "table count" },
      { path: "/sqlite/users/.actions/insert", name: "table insert" },
      { path: "/sqlite/users/1/.actions/duplicate", name: "row duplicate" },
      { path: "/sqlite/users/1/.actions/validate", name: "row validate" },
    ];

    test.each(helpPaths)("$name ($path --help)", async ({ path }) => {
      const pathId = pathToId(path);
      const result = await cli.run("exec", path, "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot(`exec-help-${pathId}`);
    }, 30000);
  });

  // ============================================================
  // Error cases
  // ============================================================
  describe("error cases", () => {
    test("exec nonexistent action fails", async () => {
      const result = await cli.run("exec", "/sqlite/users/.actions/nonexistent");
      expect(result.exitCode).not.toBe(0);
    });

    test("exec on path without actions fails", async () => {
      const result = await cli.run("exec", "/fs/README.md/.actions/foo");
      expect(result.exitCode).not.toBe(0);
    });
  });
});
