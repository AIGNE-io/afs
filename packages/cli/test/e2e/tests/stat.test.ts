/**
 * E2E tests for stat command
 *
 * Tests all combinations of:
 * - Views: human, llm, json
 * - Paths: representative paths at each level per provider
 *
 * Path levels: root → provider root → nested dir → leaf
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";
import { pathToId, removeTimestamps } from "../helpers/snapshot.js";

describe("stat command", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  const views = ["human", "llm", "json"];

  // All stat paths across providers (root → provider root → nested → leaf)
  const statPaths = [
    // Root and provider roots
    { path: "/", name: "root" },
    { path: "/fs", name: "fs provider root" },
    { path: "/json", name: "json provider root" },
    { path: "/sqlite", name: "sqlite provider root" },
    { path: "/git", name: "git provider root" },

    // FS Provider: nested dir → file → deep file
    { path: "/fs/docs", name: "fs nested dir" },
    { path: "/fs/README.md", name: "fs root file" },
    { path: "/fs/docs/guide.md", name: "fs nested file" },
    { path: "/fs/docs/api/overview.md", name: "fs deep file" },

    // JSON Provider: nested dir → leaf
    { path: "/json/config", name: "json nested dir" },
    { path: "/json/config/name", name: "json shallow leaf" },
    { path: "/json/users/0/profile/preferences/theme", name: "json deep leaf" },

    // SQLite Provider: table (has .actions) → row (has .actions)
    { path: "/sqlite/users", name: "sqlite table" },
    { path: "/sqlite/users/1", name: "sqlite row" },

    // Git Provider: branch → dir → file
    { path: "/git/main", name: "git branch" },
    { path: "/git/main/src", name: "git src dir" },
    { path: "/git/main/README.md", name: "git root file" },
    { path: "/git/main/src/index.ts", name: "git nested file" },
  ];

  describe.each(views)("view=%s", (view) => {
    test.each(statPaths)("$name ($path)", async ({ path }) => {
      const pathId = pathToId(path);
      const args = view === "json" ? ["stat", path, "--json"] : ["stat", path, "--view", view];
      const result = await cli.run(...args);
      expect(result.exitCode).toBe(0);

      const output = removeTimestamps(result.stdout);
      expect(output).toMatchSnapshot(`stat-${view}-${pathId}`);
    }, 30000);
  });

  // ============================================================
  // Action paths (.actions/action) - specific actions only
  // ============================================================
  const actionPaths = [
    { path: "/sqlite/users/.actions/export", name: "sqlite table export action" },
    { path: "/sqlite/users/.actions/count", name: "sqlite table count action" },
    { path: "/sqlite/users/1/.actions/validate", name: "sqlite row validate action" },
    { path: "/sqlite/users/1/.actions/duplicate", name: "sqlite row duplicate action" },
  ];

  describe("Action paths", () => {
    describe.each(views)("view=%s", (view) => {
      test.each(actionPaths)("$name ($path)", async ({ path }) => {
        const pathId = pathToId(path);
        const args = view === "json" ? ["stat", path, "--json"] : ["stat", path, "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`stat-${view}-${pathId}`);
      }, 30000);
    });
  });

  // ============================================================
  // Meta paths (.meta) - one per provider
  // ============================================================
  const metaPaths = [
    { path: "/fs/.meta", name: "fs provider meta" },
    { path: "/fs/docs/.meta", name: "fs nested meta" },
    { path: "/json/.meta", name: "json provider meta" },
    { path: "/sqlite/.meta", name: "sqlite provider meta" },
    { path: "/sqlite/users/.meta", name: "sqlite table meta" },
  ];

  describe("Meta paths", () => {
    describe.each(views)("view=%s", (view) => {
      test.each(metaPaths)("$name ($path)", async ({ path }) => {
        const pathId = pathToId(path);
        const args = view === "json" ? ["stat", path, "--json"] : ["stat", path, "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`stat-${view}-meta-${pathId}`);
      }, 30000);
    });
  });

  // Error case
  test("nonexistent path returns error", async () => {
    const result = await cli.run("stat", "/fs/nonexistent/file.txt");
    expect(result.exitCode).not.toBe(0);
  });
});
