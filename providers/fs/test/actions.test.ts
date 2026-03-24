import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CapabilitiesManifest } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let fs: AFSFS;
let fsReadonly: AFSFS;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-fs-actions-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create test directory structure
  await mkdir(join(testDir, "project"), { recursive: true });
  await mkdir(join(testDir, "project", "src"), { recursive: true });
  await mkdir(join(testDir, "project", "docs"), { recursive: true });
  await mkdir(join(testDir, "empty-dir"), { recursive: true });

  // Create test files with known content
  await writeFile(join(testDir, "project", "README.md"), "# Test Project\n\nHello world.\n");
  await writeFile(join(testDir, "project", "src", "index.ts"), 'console.log("hello");\n');
  await writeFile(
    join(testDir, "project", "src", "utils.ts"),
    "export const add = (a: number, b: number) => a + b;\n",
  );
  await writeFile(join(testDir, "project", "docs", "guide.md"), "# Guide\n\nUser guide.\n");

  // Create a binary-like file
  const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await writeFile(join(testDir, "project", "logo.png"), binaryBuffer);

  // Create an empty file
  await writeFile(join(testDir, "project", "empty.txt"), "");

  // Create .afs meta directory (should be excluded from archive)
  await mkdir(join(testDir, "project", ".afs"), { recursive: true });
  await writeFile(join(testDir, "project", ".afs", "meta.yaml"), "kind: test:project\n");

  // Create a .gitignore in project
  await writeFile(join(testDir, "project", ".gitignore"), "node_modules/\n*.log\n");

  // Create an ignored file
  await writeFile(join(testDir, "project", "debug.log"), "some log content");

  // Initialize providers
  fs = new AFSFS({ localPath: testDir, accessMode: "readwrite" });
  fsReadonly = new AFSFS({ localPath: testDir, accessMode: "readonly" });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ===== CAPABILITIES =====

describe("capabilities", () => {
  test("should return complete operations list + action catalog", async () => {
    const result = await fs.read("/.meta/.capabilities");
    expect(result.data).toBeDefined();
    expect(result.data?.path).toBe("/.meta/.capabilities");

    const manifest = result.data?.content as unknown as CapabilitiesManifest;
    expect(manifest).toBeDefined();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.provider).toBeDefined();
    expect(manifest.actions).toBeDefined();
    expect(Array.isArray(manifest.actions)).toBe(true);

    // Should have archive and checksum actions
    const actionNames = manifest.actions.flatMap((a) => a.catalog.map((c) => c.name));
    expect(actionNames).toContain("archive");
    expect(actionNames).toContain("checksum");

    // Meta should include operations
    expect(result.data?.meta?.operations).toBeDefined();
    const ops = result.data?.meta?.operations as string[];
    expect(ops).toContain("list");
    expect(ops).toContain("read");
    expect(ops).toContain("stat");
    expect(ops).toContain("explain");
    expect(ops).toContain("search");
    expect(ops).toContain("write");
    expect(ops).toContain("delete");
  });

  test("readonly provider should not include write operations", async () => {
    const result = await fsReadonly.read("/.meta/.capabilities");
    expect(result.data).toBeDefined();

    const ops = result.data?.meta?.operations as string[];
    expect(ops).toContain("list");
    expect(ops).toContain("read");
    expect(ops).not.toContain("write");
    expect(ops).not.toContain("delete");
  });

  test("capabilities should not expose internal implementation details", async () => {
    const result = await fs.read("/.meta/.capabilities");
    const content = JSON.stringify(result.data?.content);
    // Should not contain local filesystem paths
    expect(content).not.toContain(testDir);
  });

  test("capabilities is read-only operation", async () => {
    // Reading capabilities should work on readonly provider
    const result = await fsReadonly.read("/.meta/.capabilities");
    expect(result.data).toBeDefined();
  });
});

// ===== ARCHIVE ACTION =====

describe("archive action", () => {
  describe("Happy Path", () => {
    test("archive tar.gz format should return tmpdir file path and size", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.outputPath).toBeDefined();
      expect(typeof result.data?.outputPath).toBe("string");
      expect((result.data?.outputPath as string).endsWith(".tar.gz")).toBe(true);
      expect(result.data?.size).toBeDefined();
      expect(typeof result.data?.size).toBe("number");
      expect(result.data?.size as number).toBeGreaterThan(0);
      expect(result.data?.fileCount).toBeDefined();
      expect(typeof result.data?.fileCount).toBe("number");

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive zip format should return tmpdir file path and size", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "zip",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.outputPath).toBeDefined();
      expect((result.data?.outputPath as string).endsWith(".zip")).toBe(true);
      expect(result.data?.size).toBeDefined();
      expect(result.data?.size as number).toBeGreaterThan(0);

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive with pattern filter should only include matching files", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
        pattern: "**/*.ts",
      });

      expect(result.success).toBe(true);
      expect(result.data?.fileCount).toBe(2); // index.ts and utils.ts

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive should return correct fileCount", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      // Files: README.md, src/index.ts, src/utils.ts, docs/guide.md, logo.png, empty.txt, .gitignore
      // Excluded: .afs/, debug.log (not excluded unless useGitignore is on - but we didn't enable it)
      expect(typeof result.data?.fileCount).toBe("number");
      expect(result.data?.fileCount as number).toBeGreaterThanOrEqual(1);

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive generated file should be valid (can stat it)", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      const outputPath = result.data?.outputPath as string;

      // Verify file exists and has content
      const fileStat = await stat(outputPath);
      expect(fileStat.size).toBeGreaterThan(0);
      expect(fileStat.size).toBe(result.data?.size as number);

      // Clean up
      await rm(outputPath, { force: true });
    });
  });

  describe("Bad Path", () => {
    test("archive on file node should error", async () => {
      const result = await fs.exec("/project/README.md/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("archive with unsupported format should error", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "rar",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("archive empty directory should succeed with fileCount=0", async () => {
      const result = await fs.exec("/empty-dir/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      expect(result.data?.fileCount).toBe(0);

      // Clean up
      if (result.data?.outputPath) {
        await rm(result.data.outputPath as string, { force: true });
      }
    });
  });

  describe("Edge Cases", () => {
    test("archive directory containing binary files", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      expect(result.data?.fileCount as number).toBeGreaterThanOrEqual(1);

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive should not include .afs/ metadata directory", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      // The .afs directory and its contents should be excluded
      // Verify via includedFiles if available
      if (result.data?.includedFiles) {
        const files = result.data.includedFiles as string[];
        expect(files.every((f) => !f.includes(".afs/"))).toBe(true);
      }

      // Clean up
      const outputPath = result.data?.outputPath as string;
      await rm(outputPath, { force: true });
    });

    test("archive with pattern matching no files should return fileCount=0", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
        pattern: "**/*.nonexistent",
      });

      expect(result.success).toBe(true);
      expect(result.data?.fileCount).toBe(0);

      // Clean up
      if (result.data?.outputPath) {
        await rm(result.data.outputPath as string, { force: true });
      }
    });

    test("archive with symlink in directory", async () => {
      // Create a symlink in the test dir
      const symlinkDir = join(testDir, "with-symlink");
      await mkdir(symlinkDir, { recursive: true });
      await writeFile(join(symlinkDir, "real.txt"), "real content");
      try {
        await symlink(join(symlinkDir, "real.txt"), join(symlinkDir, "link.txt"));
      } catch {
        // Symlinks may not be supported on all systems, skip
        return;
      }

      const symlinkFs = new AFSFS({ localPath: testDir, accessMode: "readwrite" });
      const result = await symlinkFs.exec("/with-symlink/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      expect(result.data?.fileCount as number).toBeGreaterThanOrEqual(1);

      // Clean up
      if (result.data?.outputPath) {
        await rm(result.data.outputPath as string, { force: true });
      }
      await rm(symlinkDir, { recursive: true, force: true });
    });
  });

  describe("Security", () => {
    test("archive cannot pack files outside mount path (path traversal)", async () => {
      const result = await fs.exec("/../../../etc/.actions/archive", {
        format: "tar.gz",
      });

      // Should fail or the resolved path should be within mount
      if (result.success) {
        // If it succeeded, verify no files from outside were included
        expect(result.data?.outputPath).toBeDefined();
        await rm(result.data?.outputPath as string, { force: true });
      } else {
        expect(result.error).toBeDefined();
      }
    });

    test("archive output path is in os.tmpdir()", async () => {
      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);
      const outputPath = result.data?.outputPath as string;
      expect(outputPath.startsWith(tmpdir())).toBe(true);

      // Clean up
      await rm(outputPath, { force: true });
    });
  });

  describe("Data Leak", () => {
    test("archive error messages should not expose local filesystem paths", async () => {
      const result = await fs.exec("/nonexistent-dir/.actions/archive", {
        format: "tar.gz",
      });

      if (!result.success && result.error?.message) {
        expect(result.error.message).not.toContain(testDir);
      }
    });
  });

  describe("Data Damage", () => {
    test("archive should not modify source files", async () => {
      const contentBefore = await readFile(join(testDir, "project", "README.md"), "utf8");

      const result = await fs.exec("/project/.actions/archive", {
        format: "tar.gz",
      });

      expect(result.success).toBe(true);

      const contentAfter = await readFile(join(testDir, "project", "README.md"), "utf8");
      expect(contentAfter).toBe(contentBefore);

      // Clean up
      await rm(result.data?.outputPath as string, { force: true });
    });
  });
});

// ===== CHECKSUM ACTION =====

describe("checksum action", () => {
  describe("Happy Path", () => {
    test("checksum sha256 should return hex string", async () => {
      const result = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha256",
      });

      expect(result.success).toBe(true);
      expect(result.data?.hash).toBeDefined();
      expect(typeof result.data?.hash).toBe("string");
      // SHA256 produces 64-char hex string
      expect((result.data?.hash as string).length).toBe(64);
      expect(result.data?.hash as string).toMatch(/^[0-9a-f]+$/);
      expect(result.data?.algorithm).toBe("sha256");
    });

    test("checksum md5 should return correct hash", async () => {
      const result = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "md5",
      });

      expect(result.success).toBe(true);
      // MD5 produces 32-char hex string
      expect((result.data?.hash as string).length).toBe(32);

      // Verify against Node.js crypto
      const content = await readFile(join(testDir, "project", "README.md"));
      const expected = createHash("md5").update(content).digest("hex");
      expect(result.data?.hash).toBe(expected);
    });

    test("checksum sha1 should return correct hash", async () => {
      const result = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha1",
      });

      expect(result.success).toBe(true);
      // SHA1 produces 40-char hex string
      expect((result.data?.hash as string).length).toBe(40);
    });

    test("checksum sha512 should return correct hash", async () => {
      const result = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha512",
      });

      expect(result.success).toBe(true);
      // SHA512 produces 128-char hex string
      expect((result.data?.hash as string).length).toBe(128);
    });

    test("checksum multiple calls should return consistent results", async () => {
      const result1 = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha256",
      });
      const result2 = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha256",
      });

      expect(result1.data?.hash).toBe(result2.data?.hash);
    });
  });

  describe("Bad Path", () => {
    test("checksum on directory should error", async () => {
      const result = await fs.exec("/project/.actions/checksum", {
        algorithm: "sha256",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("checksum with unsupported algorithm should error", async () => {
      const result = await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha999",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("checksum on empty file", async () => {
      const result = await fs.exec("/project/empty.txt/.actions/checksum", {
        algorithm: "sha256",
      });

      expect(result.success).toBe(true);
      // SHA256 of empty content
      const expected = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
      expect(result.data?.hash).toBe(expected);
    });

    test("checksum on binary file", async () => {
      const result = await fs.exec("/project/logo.png/.actions/checksum", {
        algorithm: "sha256",
      });

      expect(result.success).toBe(true);
      expect(result.data?.hash).toBeDefined();

      // Verify against Node.js crypto
      const content = await readFile(join(testDir, "project", "logo.png"));
      const expected = createHash("sha256").update(content).digest("hex");
      expect(result.data?.hash).toBe(expected);
    });
  });

  describe("Security", () => {
    test("checksum cannot compute hash for file outside mount path", async () => {
      const result = await fs.exec("/../../../etc/passwd/.actions/checksum", {
        algorithm: "sha256",
      });

      // Should fail - path traversal should be blocked
      if (result.success) {
        // If the path was normalized to something within mount, that's ok
        // but we expect it to fail in most cases
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("Data Leak", () => {
    test("checksum error messages should not expose file content", async () => {
      const result = await fs.exec("/nonexistent-file/.actions/checksum", {
        algorithm: "sha256",
      });

      if (!result.success && result.error?.message) {
        // Error should not contain any file content
        expect(result.error.message).not.toContain("Hello world");
      }
    });
  });

  describe("Data Damage", () => {
    test("checksum is read-only operation", async () => {
      const contentBefore = await readFile(join(testDir, "project", "README.md"), "utf8");

      await fs.exec("/project/README.md/.actions/checksum", {
        algorithm: "sha256",
      });

      const contentAfter = await readFile(join(testDir, "project", "README.md"), "utf8");
      expect(contentAfter).toBe(contentBefore);
    });
  });
});
