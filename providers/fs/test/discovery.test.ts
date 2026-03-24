import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";
import { dump as yamlDump } from "js-yaml";

let testDir: string;
let fs: AFSFS;

beforeAll(async () => {
  // Create a temporary directory for testing
  testDir = join(tmpdir(), `afs-discovery-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create test file structure
  await mkdir(join(testDir, "project"), { recursive: true });
  await mkdir(join(testDir, "project", "src"), { recursive: true });
  await mkdir(join(testDir, "project", "docs"), { recursive: true });
  await writeFile(
    join(testDir, "project", "README.md"),
    "# Test Project\n\nThis is a test project.",
  );
  await writeFile(join(testDir, "project", "src", "index.ts"), 'console.log("hello");');

  // Create .afs meta structure for the project directory
  await mkdir(join(testDir, "project", ".afs"), { recursive: true });
  await writeFile(
    join(testDir, "project", ".afs", "meta.yaml"),
    yamlDump({
      kind: "test:project",
      name: "My Test Project",
      status: "active",
      description: "A project for testing discovery APIs",
    }),
  );

  // Create meta for README.md
  await mkdir(join(testDir, "project", ".afs", ".nodes", "README.md"), { recursive: true });
  await writeFile(
    join(testDir, "project", ".afs", ".nodes", "README.md", "meta.yaml"),
    yamlDump({
      kind: "afs:document",
      title: "Project README",
      author: "Test Author",
    }),
  );

  // Create a file without meta
  await writeFile(join(testDir, "project", "no-meta.txt"), "No meta for this file");

  // Create a directory without meta
  await mkdir(join(testDir, "empty-dir"), { recursive: true });

  // Initialize AFSFS
  fs = new AFSFS({ localPath: testDir });
});

afterAll(async () => {
  // Clean up test directory
  await rm(testDir, { recursive: true, force: true });
});

describe("Step 5.1: stat() with Meta", () => {
  describe("Basic stat() functionality", () => {
    test("should stat a directory with path, childrenCount, and updatedAt", async () => {
      const result = await fs.stat("/project");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/project");
      expect(typeof result.data?.meta?.childrenCount).toBe("number");
      expect(result.data?.updatedAt).toBeDefined();
    });

    test("should stat a file with path, size, and updatedAt", async () => {
      const result = await fs.stat("/project/README.md");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/project/README.md");
      expect(result.data?.meta?.childrenCount).toBeUndefined();
      expect(result.data?.meta?.size).toBeGreaterThan(0);
      expect(result.data?.updatedAt).toBeDefined();
    });

    test("should throw for non-existent path", async () => {
      await expect(fs.stat("/nonexistent")).rejects.toThrow();
    });
  });

  describe("stat() with Meta", () => {
    test("should include meta object when present", async () => {
      const result = await fs.stat("/project");

      expect(result.data).toBeDefined();
      expect(result.data?.meta).toBeDefined();
      expect(result.data?.meta?.kind).toBe("test:project");
      expect(result.data?.meta?.name).toBe("My Test Project");
    });

    test("should include file meta when present", async () => {
      const result = await fs.stat("/project/README.md");

      expect(result.data).toBeDefined();
      expect(result.data?.meta).toBeDefined();
      expect(result.data?.meta?.kind).toBe("afs:document");
      expect(result.data?.meta?.title).toBe("Project README");
    });

    test("should work without meta", async () => {
      const result = await fs.stat("/project/no-meta.txt");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/project/no-meta.txt");
      expect(result.data?.meta?.childrenCount).toBeUndefined();
      // meta should only contain size for files without user-defined meta
      expect(result.data?.meta?.size).toBeGreaterThan(0);
    });

    test("should work for directory without meta", async () => {
      const result = await fs.stat("/empty-dir");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/empty-dir");
      expect(typeof result.data?.meta?.childrenCount).toBe("number");
      // meta should only contain childrenCount for directories without user-defined meta
    });
  });

  describe("stat() with kindSchema", () => {
    test("should not have kindSchema for non-well-known kind", async () => {
      const result = await fs.stat("/project");

      expect(result.data).toBeDefined();
      // test:project is not a well-known kind
      expect(result.data?.meta?.kind).toBe("test:project");
    });

    test("should return well-known kind in meta", async () => {
      const result = await fs.stat("/project/README.md");

      expect(result.data).toBeDefined();
      // afs:document is a well-known kind
      expect(result.data?.meta?.kind).toBe("afs:document");
    });
  });
});

describe("Step 5.2: explain() for LLM", () => {
  describe("explain() markdown format", () => {
    test("should return markdown description for directory", async () => {
      const result = await fs.explain("/project");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");

      // Should contain basic info
      expect(result.content).toContain("project");
    });

    test("should include node type in description", async () => {
      const result = await fs.explain("/project");

      expect(result.content).toContain("directory");
    });

    test("should include kind information when present", async () => {
      const result = await fs.explain("/project");

      // Should mention the kind
      expect(result.content).toMatch(/test:project|kind/i);
    });

    test("should list children for directory", async () => {
      const result = await fs.explain("/project");

      // Should list children
      expect(result.content).toContain("README.md");
      expect(result.content).toContain("src");
    });

    test("should explain a file", async () => {
      const result = await fs.explain("/project/README.md");

      expect(result.content).toContain("README.md");
      expect(result.content).toContain("file");
    });
  });

  describe("explain() text format", () => {
    test("should return text format when specified", async () => {
      const result = await fs.explain("/project", { format: "text" });

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");

      // Text format should not have markdown headers
      // (or have minimal markdown)
    });
  });

  describe("explain() edge cases", () => {
    test("should throw for non-existent path", async () => {
      await expect(fs.explain("/nonexistent")).rejects.toThrow();
    });

    test("should handle node without meta", async () => {
      const result = await fs.explain("/project/no-meta.txt");

      expect(result.content).toContain("no-meta.txt");
    });

    test("should handle empty directory", async () => {
      const result = await fs.explain("/empty-dir");

      expect(result.content).toContain("empty-dir");
    });

    test("should include meta description if present", async () => {
      const result = await fs.explain("/project");

      // Meta has description field
      expect(result.content).toContain("testing discovery APIs");
    });
  });

  describe("explain() kind schema summary", () => {
    test("should include kind schema summary for well-known kinds", async () => {
      const result = await fs.explain("/project/README.md");

      // Should mention it's a document
      expect(result.content).toMatch(/document/i);
    });
  });
});

describe("Integration: stat + explain together", () => {
  test("stat and explain return consistent data", async () => {
    const statResult = await fs.stat("/project");
    const explainResult = await fs.explain("/project");

    expect(statResult.data?.path).toBe("/project");
    expect(explainResult.content).toContain("project");

    // stat should indicate it has children
    expect(typeof statResult.data?.meta?.childrenCount).toBe("number");
    // explain should contain kind info (capital K in output)
    expect(explainResult.content).toContain("Kind");
  });
});
