/**
 * E2E tests for read command
 *
 * Tests all combinations of:
 * - Views: human, llm, json
 * - Paths: representative paths at each level per provider
 *
 * Path levels: provider root file → nested file → deep file
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";
import {
  pathToId,
  removeDirSizes,
  removeTimestamps,
  removeVolatileJsonFields,
} from "../helpers/snapshot.js";

describe("read command", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  const views = ["human", "llm", "json"];

  // All readable paths across providers (provider root → nested → leaf)
  // Note: root "/" is excluded because it's a virtual directory (only listable, not readable)
  const readPaths = [
    // Provider roots (directories)
    { path: "/fs", name: "fs provider root" },
    { path: "/json", name: "json provider root" },
    { path: "/sqlite", name: "sqlite provider root" },
    { path: "/git", name: "git provider root" },

    // FS Provider: nested dir → root file → nested file → deep file
    { path: "/fs/docs", name: "fs nested dir" },
    { path: "/fs/README.md", name: "fs root file" },
    { path: "/fs/docs/guide.md", name: "fs nested file" },
    { path: "/fs/docs/api/overview.md", name: "fs deep file" },

    // JSON Provider: nested dir → shallow leaf → deep leaf
    { path: "/json/config", name: "json nested dir" },
    { path: "/json/config/name", name: "json shallow leaf" },
    { path: "/json/users/0/profile/preferences/theme", name: "json deep leaf" },

    // SQLite Provider: table dir → row (has .actions)
    { path: "/sqlite/users", name: "sqlite table dir" },
    { path: "/sqlite/users/1", name: "sqlite row" },

    // Git Provider: branch dir → root file → nested file
    { path: "/git/main", name: "git branch dir" },
    { path: "/git/main/README.md", name: "git root file" },
    { path: "/git/main/src/index.ts", name: "git nested file" },
  ];

  describe.each(views)("view=%s", (view) => {
    test.each(readPaths)("$name ($path)", async ({ path }) => {
      const pathId = pathToId(path);
      const args = view === "json" ? ["read", path, "--json"] : ["read", path, "--view", view];
      const result = await cli.run(...args);
      expect(result.exitCode).toBe(0);

      const output =
        view === "json"
          ? removeTimestamps(removeVolatileJsonFields(result.stdout))
          : removeDirSizes(removeTimestamps(result.stdout));
      expect(output).toMatchSnapshot(`read-${view}-${pathId}`);
    }, 30000);
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
        const args = view === "json" ? ["read", path, "--json"] : ["read", path, "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output =
          view === "json"
            ? removeTimestamps(removeVolatileJsonFields(result.stdout))
            : removeDirSizes(removeTimestamps(result.stdout));
        expect(output).toMatchSnapshot(`read-${view}-meta-${pathId}`);
      }, 30000);
    });
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
        const args = view === "json" ? ["read", path, "--json"] : ["read", path, "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatchSnapshot(`read-${view}-${pathId}`);
      }, 30000);
    });
  });
});
