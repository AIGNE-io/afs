/**
 * E2E tests for ls command
 *
 * Tests all combinations of:
 * - Paths: / (root), /fs, /fs/docs, /json, /json/config, /sqlite, /sqlite/users
 * - Depths: 0, 1, 2, 3
 * - Views: human, llm, json
 *
 * Uses test.each with toMatchSnapshot for comprehensive coverage.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";
import { pathToId, removeDirSizes, removeVolatileJsonFields } from "../helpers/snapshot.js";

describe("ls command", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  // Test paths covering different provider types
  const paths = [
    { path: "/", name: "root" },
    { path: "/fs", name: "fs provider" },
    { path: "/fs/docs", name: "fs nested" },
    { path: "/json", name: "json provider" },
    { path: "/json/config", name: "json nested" },
    { path: "/sqlite", name: "sqlite provider" },
    { path: "/sqlite/users", name: "sqlite nested" },
  ];

  const depths = [0, 1, 2, 3];
  const views = ["human", "llm", "json"];

  // Three-level nesting: view → path → depth
  describe.each(views)("view=%s", (view) => {
    describe.each(paths)("$name ($path)", ({ path }) => {
      const pathId = pathToId(path);

      test.each(depths)("depth=%d", async (depth) => {
        const args =
          view === "json"
            ? ["ls", path, "--depth", String(depth), "--json"]
            : ["ls", path, "--depth", String(depth), "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output =
          view === "json" ? removeVolatileJsonFields(result.stdout) : removeDirSizes(result.stdout);
        expect(output).toMatchSnapshot(`ls-${view}-${pathId}-d${depth}`);
      }, 30000);
    });
  });

  // ============================================================
  // .actions paths (one representative per level)
  // ============================================================
  const actionPaths = [
    { path: "/sqlite/.actions", name: "sqlite root actions" },
    { path: "/sqlite/users/.actions", name: "sqlite table actions" },
    { path: "/sqlite/users/1/.actions", name: "sqlite row actions" },
  ];

  describe(".actions paths", () => {
    describe.each(views)("view=%s", (view) => {
      test.each(actionPaths)("$name ($path)", async ({ path }) => {
        const pathId = pathToId(path);
        const args = view === "json" ? ["ls", path, "--json"] : ["ls", path, "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatchSnapshot(`ls-${view}-${pathId}`);
      }, 30000);
    });
  });

  // Error case
  test("nonexistent path returns error", async () => {
    const result = await cli.run("ls", "/fs/nonexistent");
    expect(result.exitCode).not.toBe(0);
  });
});
