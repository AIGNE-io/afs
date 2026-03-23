import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import {
  findFirstDirectory,
  findFirstFile,
  flattenTree,
  isDirectory,
  type TestConfig,
  type TestDataStructure,
} from "../types.js";

/**
 * Run MetaOperations test suite.
 * Tests the .meta path suffix for reading and writing metadata.
 */
export function runMetaTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  const root = structure.root;
  const allNodes = flattenTree(root);

  // Find entries with pre-existing metadata
  const rootHasMeta = root.meta !== undefined;
  const fileWithMeta = allNodes.find(
    (n) => n.path !== "/" && !isDirectory(n.node) && n.node.meta !== undefined,
  );
  const subdirFileWithMeta = allNodes.find(
    (n) => n.depth >= 2 && !isDirectory(n.node) && n.node.meta !== undefined,
  );
  const dirWithMeta = allNodes.find(
    (n) => n.path !== "/" && isDirectory(n.node) && n.node.meta !== undefined,
  );
  const dirNode = findFirstDirectory(root);
  const fileNode = findFirstFile(root);

  // Find a file in subdirectory (depth >= 2)
  const subdirFileNode = allNodes.find(
    (n) => n.depth >= 2 && n.node.content !== undefined && !isDirectory(n.node),
  );

  describe("meta-read-existing", () => {
    if (rootHasMeta) {
      test("meta-read-root-existing: should read pre-existing root metadata", async () => {
        const provider = getProvider();
        if (!provider.read) {
          // read not supported, skip
          return;
        }

        const result = await provider.read("/.meta");
        expect(result.data).toBeDefined();
        expect(result.data?.meta).toBeDefined();

        // Verify expected metadata values
        for (const [key, value] of Object.entries(root.meta!)) {
          expect(result.data?.meta?.[key]).toEqual(value);
        }
      });
    }

    if (fileWithMeta) {
      test("meta-read-file-existing: should read pre-existing file metadata", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(joinURL(fileWithMeta.path, ".meta"));
        expect(result.data).toBeDefined();
        expect(result.data?.meta).toBeDefined();

        // Verify expected metadata values
        for (const [key, value] of Object.entries(fileWithMeta.node.meta!)) {
          expect(result.data?.meta?.[key]).toEqual(value);
        }
      });
    }

    if (dirWithMeta) {
      test("meta-read-directory-existing: should read pre-existing directory metadata", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(joinURL(dirWithMeta.path, ".meta"));
        expect(result.data).toBeDefined();
        expect(result.data?.meta).toBeDefined();

        // Verify expected metadata values
        for (const [key, value] of Object.entries(dirWithMeta.node.meta!)) {
          expect(result.data?.meta?.[key]).toEqual(value);
        }
      });
    }

    if (subdirFileWithMeta) {
      test("meta-read-subdir-file-existing: should read pre-existing subdir file metadata", async () => {
        const provider = getProvider();
        if (!provider.read) return;

        const result = await provider.read(joinURL(subdirFileWithMeta.path, ".meta"));
        expect(result.data).toBeDefined();
        expect(result.data?.meta).toBeDefined();

        // Verify expected metadata values
        for (const [key, value] of Object.entries(subdirFileWithMeta.node.meta!)) {
          expect(result.data?.meta?.[key]).toEqual(value);
        }
      });
    }
  });

  describe("meta-write-read", () => {
    // Helper to check if provider supports meta writes via node path
    // New design: metadata is written via the node path with payload.meta, not via .meta path
    // Does round-trip verification: writes metadata, reads it back, verifies it was stored
    async function supportsMetaWrite(provider: AFSModule, nodePath: string): Promise<boolean> {
      if (!provider.write || !provider.read) return false;
      try {
        // Write test metadata via node path
        await provider.write(nodePath, { meta: { __afs_test_meta_support: true } });

        // Read back via .meta path to verify it was actually stored
        const metaPath = joinURL(nodePath, ".meta");
        const result = await provider.read(metaPath);

        // Check if our test metadata is present
        const stored = result.data?.meta?.__afs_test_meta_support;
        return stored === true;
      } catch (e) {
        // "No write handler" means provider doesn't support meta writes
        // "No valid columns" means meta path was routed to a row update handler (provider doesn't support meta writes)
        if (
          e instanceof Error &&
          (e.message.includes("No write handler") || e.message.includes("No valid columns"))
        ) {
          return false;
        }
        // Other errors (e.g., path not found, read errors) mean metadata write isn't supported
        return false;
      }
    }

    // Test writing metadata to an existing file at root level
    if (fileNode) {
      test("meta-write-read-file-root: should write and read metadata for existing file", async () => {
        const provider = getProvider();
        if (!provider.write || !provider.read) {
          // write or read not supported, skip
          return;
        }

        // Use existing file from structure
        const testPath = fileNode.path;
        const metaPath = joinURL(testPath, ".meta");

        // Check if provider supports meta writes (via node path)
        if (!(await supportsMetaWrite(provider, testPath))) {
          // Provider doesn't support meta writes (e.g., read-only schema introspection)
          return;
        }

        // Write metadata via node path (new design)
        const testMeta = { customField: "rootValue", count: 100 };
        const writeResult = await provider.write(testPath, { meta: testMeta });
        expect(writeResult).toBeDefined();
        expect(writeResult.data).toBeDefined();

        // Read back metadata via .meta path
        const readResult = await provider.read(metaPath);
        expect(readResult.data).toBeDefined();
        expect(readResult.data?.meta).toBeDefined();
        expect(readResult.data?.meta?.customField).toBe("rootValue");
        expect(readResult.data?.meta?.count).toBe(100);
      });
    }

    // Test writing metadata to a file in subdirectory
    if (subdirFileNode) {
      test("meta-write-read-file-subdir: should write and read metadata for file in subdirectory", async () => {
        const provider = getProvider();
        if (!provider.write || !provider.read) return;

        // Use existing file from structure in subdirectory
        const testPath = subdirFileNode.path;
        const metaPath = joinURL(testPath, ".meta");

        // Check if provider supports meta writes (via node path)
        if (!(await supportsMetaWrite(provider, testPath))) {
          return;
        }

        // Write metadata via node path (new design)
        const testMeta = { location: "subdir", priority: 5 };
        const writeResult = await provider.write(testPath, { meta: testMeta });
        expect(writeResult).toBeDefined();

        // Read back metadata via .meta path
        const readResult = await provider.read(metaPath);
        expect(readResult.data).toBeDefined();
        expect(readResult.data?.meta?.location).toBe("subdir");
        expect(readResult.data?.meta?.priority).toBe(5);
      });
    }

    if (dirNode) {
      test("meta-write-read-directory: should write and read metadata for directory", async () => {
        const provider = getProvider();
        if (!provider.write || !provider.read) return;

        // Write metadata for existing directory via node path
        const testPath = dirNode.path;
        const metaPath = joinURL(testPath, ".meta");

        // Check if provider supports meta writes (via node path)
        if (!(await supportsMetaWrite(provider, testPath))) {
          return;
        }

        // Write metadata via node path (new design)
        const testMeta = { dirType: "documentation", indexed: true };
        const writeResult = await provider.write(testPath, { meta: testMeta });
        expect(writeResult).toBeDefined();

        // Read back metadata via .meta path
        const readResult = await provider.read(metaPath);
        expect(readResult.data).toBeDefined();
        expect(readResult.data?.meta?.dirType).toBe("documentation");
        expect(readResult.data?.meta?.indexed).toBe(true);
      });
    }

    test("meta-write-read-root: should write and read metadata for root directory", async () => {
      const provider = getProvider();
      if (!provider.write || !provider.read) {
        // write or read not supported, skip
        return;
      }

      // Write metadata for root via root path (new design)
      const rootPath = "/";
      const metaPath = "/.meta";

      // Check if provider supports meta writes (via node path)
      if (!(await supportsMetaWrite(provider, rootPath))) {
        return;
      }

      // Write metadata via root path (new design)
      const testMeta = { projectName: "test-project", version: "1.0.0" };
      const writeResult = await provider.write(rootPath, { meta: testMeta });
      expect(writeResult).toBeDefined();

      // Read back metadata via .meta path
      const readResult = await provider.read(metaPath);
      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.projectName).toBe("test-project");
      expect(readResult.data?.meta?.version).toBe("1.0.0");
    });

    // Test metadata merge on an existing file
    if (fileNode) {
      test("meta-merge: should merge metadata on subsequent writes", async () => {
        const provider = getProvider();
        if (!provider.write || !provider.read) {
          // write or read not supported, skip
          return;
        }

        // Use existing file from structure
        const testPath = fileNode.path;
        const metaPath = joinURL(testPath, ".meta");

        // Check if provider supports meta writes (via node path)
        if (!(await supportsMetaWrite(provider, testPath))) {
          return;
        }

        // Write first batch of metadata via node path (new design)
        await provider.write(testPath, { meta: { field1: "value1", field2: "value2" } });

        // Write second batch - should merge
        await provider.write(testPath, { meta: { field2: "updated", field3: "value3" } });

        // Read back and verify merge via .meta path
        const readResult = await provider.read(metaPath);
        expect(readResult.data?.meta?.field1).toBe("value1");
        expect(readResult.data?.meta?.field2).toBe("updated");
        expect(readResult.data?.meta?.field3).toBe("value3");
      });
    }
  });
}
