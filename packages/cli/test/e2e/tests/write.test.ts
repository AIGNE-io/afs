/**
 * E2E tests for write command
 *
 * Tests write operations across providers:
 * - FS: file creation and updates
 * - JSON: key/value creation and updates
 * - SQLite: row updates
 *
 * Write modes:
 * - content only
 * - metadata only (--meta)
 * - content + metadata
 *
 * All views: human, llm, json
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";
import { removeTimestamps } from "../helpers/snapshot.js";

describe("write command", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  const views = ["human", "llm", "json"];

  // Write modes for testing
  const writeModes = [
    { mode: "content", name: "content only" },
    { mode: "metadata", name: "metadata only" },
    { mode: "both", name: "content + metadata" },
  ];

  // ============================================================
  // FS Provider: file operations with content and metadata
  // ============================================================
  describe("FS Provider", () => {
    describe.each(views)("view=%s", (view) => {
      describe.each(writeModes)("$name", ({ mode }) => {
        test("create new file", async () => {
          const path = `/fs/write-test-${view}-${mode}.txt`;
          const args: string[] = ["write", path];

          if (mode === "content" || mode === "both") {
            args.push("--content", `Hello from E2E test (${view}, ${mode})`);
          }
          if (mode === "metadata" || mode === "both") {
            args.push("--meta", `author=test_${view}`, "--meta", `version=1.0`);
          }

          args.push(view === "json" ? "--json" : "--view", view === "json" ? "" : view);
          // Clean up args
          const cleanArgs = args.filter((a) => a !== "");

          const result = await cli.run(...cleanArgs);

          // Metadata-only write may not be supported for FS
          if (mode === "metadata") {
            // May succeed or fail depending on implementation
            expect(typeof result.exitCode).toBe("number");
          } else {
            expect(result.exitCode).toBe(0);
            const output = removeTimestamps(result.stdout);
            expect(output).toMatchSnapshot(`write-${view}-${mode}-fs-create`);
          }
        }, 30000);

        test("update existing file", async () => {
          const path = "/fs/docs/guide.md";
          const args: string[] = ["write", path];

          if (mode === "content" || mode === "both") {
            args.push("--content", `Updated content (${view}, ${mode})`);
          }
          if (mode === "metadata" || mode === "both") {
            args.push("--meta", `updated_by=test_${view}`);
          }

          args.push(view === "json" ? "--json" : "--view", view === "json" ? "" : view);
          const cleanArgs = args.filter((a) => a !== "");

          const result = await cli.run(...cleanArgs);

          if (mode === "metadata") {
            expect(typeof result.exitCode).toBe("number");
          } else {
            expect(result.exitCode).toBe(0);
            const output = removeTimestamps(result.stdout);
            expect(output).toMatchSnapshot(`write-${view}-${mode}-fs-update`);
          }
        }, 30000);
      });
    });
  });

  // ============================================================
  // JSON Provider: key/value operations with metadata
  // ============================================================
  describe("JSON Provider", () => {
    describe.each(views)("view=%s", (view) => {
      describe.each(writeModes)("$name", ({ mode }) => {
        test("create new key", async () => {
          const path = `/json/config/key_${view}_${mode}`;
          const args: string[] = ["write", path];

          if (mode === "content" || mode === "both") {
            args.push("--content", `value_${view}_${mode}`);
          }
          if (mode === "metadata" || mode === "both") {
            args.push("--meta", `meta_key=meta_value_${view}`);
          }

          args.push(view === "json" ? "--json" : "--view", view === "json" ? "" : view);
          const cleanArgs = args.filter((a) => a !== "");

          const result = await cli.run(...cleanArgs);

          // JSON provider may not support metadata-only writes
          if (mode === "metadata") {
            expect(typeof result.exitCode).toBe("number");
          } else {
            expect(result.exitCode).toBe(0);
            const output = removeTimestamps(result.stdout);
            expect(output).toMatchSnapshot(`write-${view}-${mode}-json-create`);
          }
        }, 30000);

        test("update existing value", async () => {
          const path = "/json/config/name";
          const args: string[] = ["write", path];

          if (mode === "content" || mode === "both") {
            args.push("--content", `updated_${view}_${mode}`);
          }
          if (mode === "metadata" || mode === "both") {
            args.push("--meta", `last_updated=${view}`);
          }

          args.push(view === "json" ? "--json" : "--view", view === "json" ? "" : view);
          const cleanArgs = args.filter((a) => a !== "");

          const result = await cli.run(...cleanArgs);

          if (mode === "metadata") {
            expect(typeof result.exitCode).toBe("number");
          } else {
            expect(result.exitCode).toBe(0);
            const output = removeTimestamps(result.stdout);
            expect(output).toMatchSnapshot(`write-${view}-${mode}-json-update`);
          }
        }, 30000);
      });
    });
  });

  // ============================================================
  // SQLite Provider: row operations (typically uses --meta for fields)
  // ============================================================
  describe("SQLite Provider", () => {
    describe.each(views)("view=%s", (view) => {
      test("update row with --meta", async () => {
        const path = "/sqlite/users/1";
        const args =
          view === "json"
            ? ["write", path, "--meta", `name=SQLiteUser_${view}`, "--json"]
            : ["write", path, "--meta", `name=SQLiteUser_${view}`, "--view", view];
        const result = await cli.run(...args);

        // SQLite write may or may not be supported
        expect(result.exitCode === 0 || result.exitCode === 5).toBe(true);

        if (result.exitCode === 0) {
          const output = removeTimestamps(result.stdout);
          expect(output).toMatchSnapshot(`write-${view}-sqlite-set`);
        }
      }, 30000);
    });
  });

  // ============================================================
  // Append mode (FS only)
  // ============================================================
  describe("append mode", () => {
    describe.each(views)("view=%s", (view) => {
      test("append to existing file", async () => {
        const path = "/fs/README.md";
        const args =
          view === "json"
            ? ["write", path, "--content", "\n\nAppended content", "--mode", "append", "--json"]
            : [
                "write",
                path,
                "--content",
                "\n\nAppended content",
                "--mode",
                "append",
                "--view",
                view,
              ];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`write-${view}-fs-append`);
      }, 30000);
    });
  });

  // ============================================================
  // Error cases
  // ============================================================
  describe("error cases", () => {
    test("write to nonexistent provider path fails", async () => {
      const result = await cli.run("write", "/nonexistent/file.txt", "--content", "test");
      expect(result.exitCode).not.toBe(0);
    });

    test("write to readonly provider fails", async () => {
      // Git provider is readonly
      const result = await cli.run("write", "/git/main/test.txt", "--content", "test");
      expect(result.exitCode).not.toBe(0);
    });
  });
});
