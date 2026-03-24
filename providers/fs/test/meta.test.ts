import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";

// Simple YAML serializer for tests (only supports simple objects with string/number values)
function yamlDump(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

let testDir: string;
let fs: AFSFS;

beforeAll(async () => {
  // Create a temporary directory for testing
  testDir = join(tmpdir(), `afs-meta-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create test file structure
  await mkdir(join(testDir, "project"), { recursive: true });
  await mkdir(join(testDir, "project", "src"), { recursive: true });
  await writeFile(join(testDir, "project", "README.md"), "# Test Project");
  await writeFile(join(testDir, "project", "src", "index.ts"), 'console.log("hello");');

  // Create .afs meta structure for the project directory
  await mkdir(join(testDir, "project", ".afs"), { recursive: true });
  await writeFile(
    join(testDir, "project", ".afs", "meta.yaml"),
    yamlDump({
      kind: "test:project",
      name: "My Test Project",
      status: "active",
    }),
  );

  // Create meta with icon resource
  await writeFile(join(testDir, "project", ".afs", "icon.png"), "fake-png-content");

  // Create .afs/.nodes structure for file meta
  await mkdir(join(testDir, "project", ".afs", ".nodes", "README.md"), { recursive: true });
  await writeFile(
    join(testDir, "project", ".afs", ".nodes", "README.md", "meta.yaml"),
    yamlDump({
      kind: "afs:document",
      title: "Project README",
      author: "Test Author",
    }),
  );

  // Initialize AFSFS
  fs = new AFSFS({ localPath: testDir });
});

afterAll(async () => {
  // Clean up test directory
  await rm(testDir, { recursive: true, force: true });
});

describe("Step 2.1: Meta Storage Structure", () => {
  describe("Directory Meta Read", () => {
    test("should read directory meta from .afs/meta.yaml", async () => {
      const result = await fs.read("/project/.meta");

      expect(result.data).toBeDefined();
      expect(result.data?.meta).toBeDefined();

      const meta = result.data?.meta as Record<string, unknown>;
      expect(meta.kind).toBe("test:project");
      expect(meta.name).toBe("My Test Project");
      expect(meta.status).toBe("active");
    });

    test("should return empty metadata for non-existent meta file", async () => {
      // src directory has no .afs/meta.yaml - should return empty metadata
      const result = await fs.read("/project/src/.meta");
      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/project/src/.meta");
      expect(result.data?.meta).toEqual({});
    });

    // NOTE: MetaResource tests removed - feature removed for now
    // test("should read meta resource file from .afs/")
    // test("should throw for non-existent meta resource")
  });

  describe("File Meta Read", () => {
    test("should read file meta from .afs/.nodes/{filename}/meta.yaml", async () => {
      const result = await fs.read("/project/README.md/.meta");

      expect(result.data).toBeDefined();
      expect(result.data?.meta).toBeDefined();

      const meta = result.data?.meta as Record<string, unknown>;
      expect(meta.kind).toBe("afs:document");
      expect(meta.title).toBe("Project README");
      expect(meta.author).toBe("Test Author");
    });

    test("should return empty metadata for file without meta", async () => {
      // index.ts has no meta file - should return empty metadata
      const result = await fs.read("/project/src/index.ts/.meta");
      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/project/src/index.ts/.meta");
      expect(result.data?.meta).toEqual({});
    });
  });

  describe("Directory Meta Write", () => {
    test("should write directory meta to .afs/meta.yaml via node path", async () => {
      // Create a new directory
      await mkdir(join(testDir, "newdir"), { recursive: true });

      // Write meta via node path with metadata field (per spec: .meta paths are read-only)
      const writeResult = await fs.write("/newdir", {
        meta: {
          kind: "test:directory",
          name: "New Directory",
          description: "A test directory",
        },
      });

      expect(writeResult.data).toBeDefined();

      // Verify meta was written via .meta read path
      const readResult = await fs.read("/newdir/.meta");
      const meta = readResult.data?.meta as Record<string, unknown>;
      expect(meta.kind).toBe("test:directory");
      expect(meta.name).toBe("New Directory");

      // Verify physical file exists
      const physicalContent = await readFile(join(testDir, "newdir", ".afs", "meta.yaml"), "utf8");
      expect(physicalContent).toContain("kind: test:directory");
    });
  });

  describe("File Meta Write", () => {
    test("should write file meta to .afs/.nodes/{filename}/meta.yaml via node path", async () => {
      // Create a test file first
      await mkdir(join(testDir, "newdir"), { recursive: true });
      await writeFile(join(testDir, "newdir", "document.txt"), "Test content");

      // Write meta via node path with metadata field (per spec: .meta paths are read-only)
      const writeResult = await fs.write("/newdir/document.txt", {
        meta: {
          kind: "afs:document",
          title: "Test Document",
        },
      });

      expect(writeResult.data).toBeDefined();

      // Verify meta was written via .meta read path
      const readResult = await fs.read("/newdir/document.txt/.meta");
      const meta = readResult.data?.meta as Record<string, unknown>;
      expect(meta.kind).toBe("afs:document");
      expect(meta.title).toBe("Test Document");

      // Verify physical file exists
      const physicalContent = await readFile(
        join(testDir, "newdir", ".afs", ".nodes", "document.txt", "meta.yaml"),
        "utf8",
      );
      expect(physicalContent).toContain("kind: afs:document");
    });

    test("should write content and metadata together (atomic)", async () => {
      // Write both content and metadata in one call
      const writeResult = await fs.write("/newdir/combined.txt", {
        content: "Combined content",
        meta: {
          kind: "afs:document",
          author: "test",
        },
      });

      expect(writeResult.data).toBeDefined();

      // Verify content
      const readResult = await fs.read("/newdir/combined.txt");
      expect(readResult.data?.content).toBe("Combined content");

      // Verify meta
      const metaResult = await fs.read("/newdir/combined.txt/.meta");
      const meta = metaResult.data?.meta as Record<string, unknown>;
      expect(meta.kind).toBe("afs:document");
      expect(meta.author).toBe("test");
    });
  });

  describe("Edge Cases", () => {
    test("should handle special characters in filename", async () => {
      // Create file with special characters
      await writeFile(join(testDir, "project", "file with spaces.txt"), "content");
      await mkdir(join(testDir, "project", ".afs", ".nodes", "file with spaces.txt"), {
        recursive: true,
      });
      await writeFile(
        join(testDir, "project", ".afs", ".nodes", "file with spaces.txt", "meta.yaml"),
        yamlDump({ kind: "afs:node" }),
      );

      const result = await fs.read("/project/file with spaces.txt/.meta");
      expect(result.data).toBeDefined();
      expect((result.data?.meta as Record<string, unknown>).kind).toBe("afs:node");
    });

    test("should handle deeply nested paths", async () => {
      // Create nested directory
      await mkdir(join(testDir, "deep", "nested", "path"), { recursive: true });
      await mkdir(join(testDir, "deep", "nested", "path", ".afs"), { recursive: true });
      await writeFile(
        join(testDir, "deep", "nested", "path", ".afs", "meta.yaml"),
        yamlDump({ kind: "test:deep" }),
      );

      const result = await fs.read("/deep/nested/path/.meta");
      expect(result.data).toBeDefined();
      expect((result.data?.meta as Record<string, unknown>).kind).toBe("test:deep");
    });

    test("should handle empty meta object", async () => {
      await mkdir(join(testDir, "emptyMeta"), { recursive: true });

      // Write empty meta via node path (per spec: .meta paths are read-only)
      const writeResult = await fs.write("/emptyMeta", {
        meta: {},
      });
      expect(writeResult.data).toBeDefined();

      // Read empty meta via .meta path
      const readResult = await fs.read("/emptyMeta/.meta");
      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta).toEqual({});
    });
  });

  describe("Security", () => {
    test("should throw for path traversal in meta path", async () => {
      // Attempt path traversal - should throw because the path doesn't exist
      await expect(fs.read("/project/.meta/../../../etc/passwd")).rejects.toThrow();
    });
  });
});

describe("Step 2.3: .afs Directory Hiding", () => {
  test("should not include .afs in list results", async () => {
    const result = await fs.list("/project");

    const paths = result.data.map((e) => e.path);

    // Should not contain .afs
    expect(paths.some((p) => p.includes(".afs"))).toBe(false);

    // Should contain normal files
    expect(paths.some((p) => p.includes("README.md"))).toBe(true);
    expect(paths.some((p) => p.includes("src"))).toBe(true);
  });

  test("should not include .afs in recursive list results", async () => {
    const result = await fs.list("/project", { maxDepth: 10 });

    const paths = result.data.map((e) => e.path);

    // Should not contain any .afs paths
    expect(paths.every((p) => !p.includes(".afs"))).toBe(true);
  });

  test("should allow direct read of .afs path (convention-based metadata)", async () => {
    const result = await fs.read("/project/.afs/meta.yaml");

    // .afs paths are readable (hidden from listings, but accessible by explicit path)
    expect(result.data).toBeDefined();
    expect(result.data?.content).toContain("kind: test:project");
  });

  test("should not confuse .afs in directory name", async () => {
    // Create a directory named "my.afs"
    await mkdir(join(testDir, "my.afs"), { recursive: true });
    await writeFile(join(testDir, "my.afs", "file.txt"), "content");

    const result = await fs.list("/");
    const paths = result.data.map((e) => e.path);

    // Should include my.afs (it's a real directory, not the hidden .afs)
    expect(paths.some((p) => p.includes("my.afs"))).toBe(true);
  });
});

describe("Meta in List Results", () => {
  test("should include meta fields in list results for directories (via read)", async () => {
    // list() never returns the path itself, use read() to get entry meta
    const result = await fs.read("/project");

    expect(result.data).toBeDefined();
    expect(result.data?.meta?.kind).toBe("test:project");
    expect(result.data?.meta?.name).toBe("My Test Project");
    expect(result.data?.meta?.status).toBe("active");
  });

  test("should include meta fields in list results for files", async () => {
    const result = await fs.list("/project", { maxDepth: 1 });

    // Find the README.md entry
    const readmeEntry = result.data.find((e) => e.path === "/project/README.md");
    expect(readmeEntry).toBeDefined();
    expect(readmeEntry?.meta?.kind).toBe("afs:document");
    expect(readmeEntry?.meta?.title).toBe("Project README");
    expect(readmeEntry?.meta?.author).toBe("Test Author");
  });

  test("should include meta fields in child entries when listing parent", async () => {
    // List from root with maxDepth=1 to get /project as a child
    const result = await fs.list("/", { maxDepth: 1 });

    // Find the project entry (as a child of root)
    const projectEntry = result.data.find((e) => e.path === "/project");
    expect(projectEntry).toBeDefined();
    expect(projectEntry?.meta?.kind).toBe("test:project");
    expect(projectEntry?.meta?.name).toBe("My Test Project");
  });
});

describe("Meta Merge Behavior", () => {
  test("should merge new meta fields with existing ones", async () => {
    // Create a directory with initial meta
    await mkdir(join(testDir, "mergeTest"), { recursive: true });
    await mkdir(join(testDir, "mergeTest", ".afs"), { recursive: true });
    await writeFile(
      join(testDir, "mergeTest", ".afs", "meta.yaml"),
      yamlDump({
        kind: "test:original",
        name: "Original Name",
        status: "active",
      }),
    );

    // Write new meta via node path - should merge, not replace (per spec: .meta paths are read-only)
    await fs.write("/mergeTest", {
      meta: {
        description: "Added description",
        status: "updated",
      },
    });

    // Read back and verify merge
    const result = await fs.read("/mergeTest/.meta");
    const meta = result.data?.meta as Record<string, unknown>;

    // Original fields should be preserved
    expect(meta.kind).toBe("test:original");
    expect(meta.name).toBe("Original Name");

    // New field should be added
    expect(meta.description).toBe("Added description");

    // Updated field should have new value
    expect(meta.status).toBe("updated");
  });

  test("should merge meta when writing file with metadata", async () => {
    // Create a file with initial meta
    await mkdir(join(testDir, "mergeFileTest"), { recursive: true });
    await writeFile(join(testDir, "mergeFileTest", "doc.txt"), "content");
    await mkdir(join(testDir, "mergeFileTest", ".afs", ".nodes", "doc.txt"), { recursive: true });
    await writeFile(
      join(testDir, "mergeFileTest", ".afs", ".nodes", "doc.txt", "meta.yaml"),
      yamlDump({
        kind: "afs:document",
        author: "Original Author",
      }),
    );

    // Write file with new metadata
    await fs.write("/mergeFileTest/doc.txt", {
      content: "updated content",
      meta: {
        status: "published",
      },
    });

    // Read back meta and verify merge
    const metaResult = await fs.read("/mergeFileTest/doc.txt/.meta");
    const meta = metaResult.data?.meta as Record<string, unknown>;

    // Original fields should be preserved
    expect(meta.kind).toBe("afs:document");
    expect(meta.author).toBe("Original Author");

    // New field should be added
    expect(meta.status).toBe("published");
  });
});

describe("Root Meta Access", () => {
  test("should read root directory meta from /.meta", async () => {
    // Create root meta
    await mkdir(join(testDir, ".afs"), { recursive: true });
    await writeFile(
      join(testDir, ".afs", "meta.yaml"),
      yamlDump({
        kind: "test:root",
        name: "Test Root",
      }),
    );

    const result = await fs.read("/.meta");

    expect(result.data).toBeDefined();
    const meta = result.data?.meta as Record<string, unknown>;
    expect(meta.kind).toBe("test:root");
    expect(meta.name).toBe("Test Root");
  });

  test("should hide .afs from root listing", async () => {
    const result = await fs.list("/");

    const paths = result.data.map((e) => e.path);
    expect(paths.every((p) => !p.endsWith("/.afs") && p !== "/.afs")).toBe(true);
  });
});
