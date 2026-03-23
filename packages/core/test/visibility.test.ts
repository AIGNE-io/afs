import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

/**
 * Tests for visibility enforcement: "full" | "meta".
 *
 * visibility: "meta" — read() returns meta only (no content), search() is denied.
 * visibility: "full" — default, no restrictions.
 */

function createModule(
  visibility: "full" | "meta",
  accessMode: "readonly" | "readwrite" = "readonly",
) {
  return new JSONModule({
    name: `${visibility}-vis-module`,
    description: `Module with ${visibility} visibility`,
    accessMode,
    visibility,
    data: {
      readme: { content: "# Hello World\n\nThis is a test file." },
      config: { content: JSON.stringify({ key: "value", secret: "hidden" }) },
      dir: {
        child1: { content: "Child 1 content" },
        child2: { content: "Child 2 content" },
      },
    },
  });
}

let afs: AFS;

// ── full visibility (default) ──

describe("visibility: full (default)", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("full"));
  });

  test("read() returns content and meta", async () => {
    const result = await afs.read("/modules/full-vis-module/readme/content");
    expect(result.data?.content).toBe("# Hello World\n\nThis is a test file.");
  });

  test("list() works normally", async () => {
    const result = await afs.list("/modules/full-vis-module");
    expect(result.data.length).toBeGreaterThan(0);
  });

  test("search() works normally", async () => {
    const result = await afs.search("/modules/full-vis-module", "Hello");
    expect(result.data.length).toBeGreaterThan(0);
  });
});

// ── meta visibility ──

describe("visibility: meta", () => {
  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createModule("meta"));
  });

  // Happy path
  test("read() returns entry but content is stripped", async () => {
    const result = await afs.read("/modules/meta-vis-module/readme/content");
    // Entry should exist
    expect(result.data).toBeDefined();
    // Content should be stripped
    expect(result.data?.content).toBeUndefined();
  });

  test("read() preserves meta fields", async () => {
    const result = await afs.read("/modules/meta-vis-module/dir");
    expect(result.data).toBeDefined();
    // Meta should still be there (childrenCount etc.)
    expect(result.data?.meta).toBeDefined();
  });

  test("list() works normally", async () => {
    const result = await afs.list("/modules/meta-vis-module");
    expect(result.data.length).toBeGreaterThan(0);
  });

  // Bad path
  test("search() is denied", async () => {
    await expect(afs.search("/modules/meta-vis-module", "Hello")).rejects.toThrow(/visibility/i);
  });

  // Edge cases
  test("read() on file with no meta returns entry without content", async () => {
    const result = await afs.read("/modules/meta-vis-module/readme/content");
    expect(result.data).toBeDefined();
    expect(result.data?.content).toBeUndefined();
    // Path should still be set
    expect(result.data?.path).toBeDefined();
  });

  test("default visibility is full (backward compat)", async () => {
    const defaultModule = new JSONModule({
      name: "default-vis-module",
      accessMode: "readonly",
      data: { file: { content: "visible" } },
    });
    // No visibility set → should default to "full"
    const defaultAfs = new AFS();
    await defaultAfs.mount(defaultModule);

    const result = await defaultAfs.read("/modules/default-vis-module/file/content");
    expect(result.data?.content).toBe("visible");
  });

  // Security
  test("content is truly absent, not just hidden", async () => {
    const result = await afs.read("/modules/meta-vis-module/config/content");
    // Verify content field doesn't exist at all (not just empty)
    expect(result.data).toBeDefined();
    expect("content" in (result.data || {})).toBe(false);
  });

  test("search denial error does not reveal content", async () => {
    try {
      await afs.search("/modules/meta-vis-module", "secret");
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.message).not.toContain("hidden");
      expect(error.message).not.toContain("secret");
      expect(error.message).toContain("visibility");
    }
  });

  // Data damage: visibility doesn't affect writes
  test("visibility is read-only enforcement — writes unaffected", async () => {
    const rwAfs = new AFS();
    await rwAfs.mount(createModule("meta", "readwrite"));

    // Write should still work despite meta visibility
    const result = await rwAfs.write("/modules/meta-vis-module/newfile", { content: "New" });
    expect(result.data).toBeDefined();
  });
});
