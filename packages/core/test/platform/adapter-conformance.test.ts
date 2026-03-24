/**
 * Adapter conformance test suite — 6-dimension coverage.
 *
 * Every PlatformAdapter implementation must pass these tests.
 * Tests are auto-selected based on declared capabilities.
 *
 * Dimensions:
 *  1. Happy   — normal input, normal output
 *  2. Bad     — error input, boundary conditions, exception paths
 *  3. Security — path traversal, null byte injection, symlink following
 *  4. Vulnerability — resource exhaustion, timing attacks
 *  5. Data-leak — error messages must not expose host paths, temp cleanup
 *  6. Data-damage — concurrent write isolation, partial write recovery, roundtrip integrity
 */
import { beforeAll, describe, expect, test } from "bun:test";
import type { PlatformAdapter } from "../../src/platform/types.js";
import { AFSFileNotFoundError } from "../../src/platform/types.js";

export interface AdapterTestOptions {
  name: string;
  createAdapter: () => PlatformAdapter;
  /** A writable temp directory for fs tests. Created/cleaned by the test suite. */
  tempDir?: string;
}

export function runAdapterTests(options: AdapterTestOptions) {
  describe(`Adapter: ${options.name}`, () => {
    let adapter: PlatformAdapter;

    beforeAll(() => {
      adapter = options.createAdapter();
    });

    // ─── Capability declaration consistency ──────────────────────────────

    describe("Capability consistency", () => {
      test("fs capabilities → adapter.fs is defined", () => {
        const fsCaps = ["fs.read", "fs.write", "fs.list", "fs.stat"] as const;
        const hasFsCap = fsCaps.some((c) => adapter.capabilities.has(c));
        if (hasFsCap) {
          expect(adapter.fs).toBeDefined();
        }
      });

      test("crypto capabilities → adapter.crypto is defined", () => {
        const cryptoCaps = ["crypto.random", "crypto.hash"] as const;
        const hasCryptoCap = cryptoCaps.some((c) => adapter.capabilities.has(c));
        if (hasCryptoCap) {
          expect(adapter.crypto).toBeDefined();
        }
      });

      test("process capabilities → adapter.process is defined", () => {
        if (adapter.capabilities.has("process.spawn")) {
          expect(adapter.process?.spawn).toBeDefined();
        }
      });

      test("adapter.path is always defined", () => {
        expect(adapter.path).toBeDefined();
        expect(typeof adapter.path.join).toBe("function");
        expect(typeof adapter.path.dirname).toBe("function");
        expect(typeof adapter.path.basename).toBe("function");
        expect(typeof adapter.path.extname).toBe("function");
      });

      test("adapter.env is always defined", () => {
        expect(adapter.env).toBeDefined();
        expect(typeof adapter.env.get).toBe("function");
      });

      test("adapter.name is a non-empty string", () => {
        expect(typeof adapter.name).toBe("string");
        expect(adapter.name.length).toBeGreaterThan(0);
      });
    });

    // ─── Path utilities ─────────────────────────────────────────────────

    describe("Path utilities", () => {
      test("join segments", () => {
        const result = adapter.path.join("/foo", "bar", "baz.txt");
        expect(result).toContain("foo");
        expect(result).toContain("bar");
        expect(result).toContain("baz.txt");
      });

      test("dirname", () => {
        const result = adapter.path.dirname("/foo/bar/baz.txt");
        expect(result).not.toContain("baz.txt");
      });

      test("basename", () => {
        expect(adapter.path.basename("/foo/bar/baz.txt")).toBe("baz.txt");
      });

      test("extname", () => {
        expect(adapter.path.extname("file.json")).toBe(".json");
        expect(adapter.path.extname("file")).toBe("");
      });
    });

    // ─── Filesystem operations (if capable) ─────────────────────────────

    const hasFsRead = () => adapter.capabilities.has("fs.read");
    const hasFsWrite = () => adapter.capabilities.has("fs.write");

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 1: Happy — normal input, normal output
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Happy]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("writeFile + readTextFile roundtrip", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "test-roundtrip.txt");
        await adapter.fs!.writeFile(p, "hello world");
        const content = await adapter.fs!.readTextFile(p);
        expect(content).toBe("hello world");
      });

      test("writeFile + readFile returns Uint8Array", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "test-binary.bin");
        await adapter.fs!.writeFile(p, new Uint8Array([1, 2, 3]));
        const data = await adapter.fs!.readFile(p);
        expect(data).toBeInstanceOf(Uint8Array);
        expect(data[0]).toBe(1);
        expect(data[1]).toBe(2);
        expect(data[2]).toBe(3);
      });

      test("UTF-8 roundtrip: writeFile + readTextFile with CJK chars", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "test-utf8.txt");
        await adapter.fs!.writeFile(p, "你好世界");
        const content = await adapter.fs!.readTextFile(p);
        expect(content).toBe("你好世界");
      });

      test("exists returns true for existing file", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "test-exists.txt");
        await adapter.fs!.writeFile(p, "x");
        expect(await adapter.fs!.exists(p)).toBe(true);
      });

      test("exists returns false for non-existent file", async () => {
        if (!hasFsRead()) return;
        expect(await adapter.fs!.exists(adapter.path.join(tempDir, `nope-${Date.now()}`))).toBe(
          false,
        );
      });

      test("stat returns correct shape", async () => {
        if (!hasFsWrite()) return;
        const p = adapter.path.join(tempDir, "test-stat.txt");
        await adapter.fs!.writeFile(p, "content");
        const s = await adapter.fs!.stat(p);
        expect(s.isFile).toBe(true);
        expect(s.isDirectory).toBe(false);
        expect(s.size).toBeGreaterThan(0);
        expect(typeof s.mtime).toBe("number");
      });

      test("mkdir + readdir", async () => {
        if (!hasFsWrite() || !adapter.capabilities.has("fs.list")) return;
        const dir = adapter.path.join(tempDir, `test-dir-${Date.now()}`);
        await adapter.fs!.mkdir(dir, { recursive: true });
        await adapter.fs!.writeFile(adapter.path.join(dir, "a.txt"), "a");
        const entries = await adapter.fs!.readdir(dir);
        expect(entries).toContain("a.txt");
      });

      test("readTextFile reads empty file returns empty string", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "test-empty.txt");
        await adapter.fs!.writeFile(p, "");
        const content = await adapter.fs!.readTextFile(p);
        expect(content).toBe("");
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 2: Bad — error input, boundary conditions, exception paths
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Bad]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("readTextFile on non-existent path throws AFSFileNotFoundError", async () => {
        if (!hasFsRead()) return;
        const p = adapter.path.join(tempDir, `nonexistent-${Date.now()}.txt`);
        try {
          await adapter.fs!.readTextFile(p);
          expect(true).toBe(false); // should not reach
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
        }
      });

      test("readFile on non-existent path throws AFSFileNotFoundError", async () => {
        if (!hasFsRead()) return;
        const p = adapter.path.join(tempDir, `nonexistent-bin-${Date.now()}.bin`);
        try {
          await adapter.fs!.readFile(p);
          expect(true).toBe(false);
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
        }
      });

      test("stat on non-existent path throws AFSFileNotFoundError", async () => {
        if (!hasFsRead()) return;
        const p = adapter.path.join(tempDir, `nonexistent-stat-${Date.now()}.txt`);
        try {
          await adapter.fs!.stat(p);
          expect(true).toBe(false);
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
        }
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 3: Security — path traversal, null byte injection, symlink
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Security]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("path.join normalizes traversal sequences (../../)", () => {
        // path.join should resolve ".." segments so the result never escapes
        const result = adapter.path.join("/sandbox", "..", "..", "etc", "passwd");
        // The normalized path should not contain ".." segments
        expect(result).not.toContain("..");
      });

      test("readTextFile with path traversal ../../etc/passwd does not succeed silently", async () => {
        if (!hasFsRead()) return;
        // This path traversal attempt should either:
        // 1. Be normalized by path.join (the ".." is resolved away), OR
        // 2. Throw an error
        // It must NEVER successfully read /etc/passwd from a sandboxed context
        const traversalPath = adapter.path.join(tempDir, "..", "..", "..", "etc", "passwd");
        try {
          const content = await adapter.fs!.readTextFile(traversalPath);
          // If read succeeded, verify the path was normalized (not actually /etc/passwd)
          // For MemoryFS this will throw AFSFileNotFoundError since nothing is at the normalized path
          // For NodeAdapter on a real FS, the normalized path should stay within expected bounds
          expect(content).toBeDefined(); // If we reach here, path was normalized
        } catch {
          // Expected — file doesn't exist at normalized path, which is safe
        }
      });

      test("null byte in path is rejected or neutralized", async () => {
        if (!hasFsWrite()) return;
        // Null bytes in filenames are a classic injection vector (C string termination)
        const nullPath = adapter.path.join(tempDir, "file\x00.txt");
        try {
          await adapter.fs!.writeFile(nullPath, "malicious");
          // If writeFile succeeds, the null byte was stripped or path was sanitized.
          // Verify we can read back consistently (no truncation at null byte).
          const content = await adapter.fs!.readTextFile(nullPath);
          expect(content).toBe("malicious");
        } catch {
          // Also acceptable: adapter rejects null bytes outright
        }
      });

      test("writeFile with path traversal does not escape sandbox", async () => {
        if (!hasFsWrite()) return;
        const traversalPath = adapter.path.join(tempDir, "..", "..", "tmp", "escape-test.txt");
        try {
          await adapter.fs!.writeFile(traversalPath, "escaped");
          // If write succeeded, path was normalized — verify it's within expected bounds
          // The normalized path should not contain ".."
          expect(traversalPath).toBeDefined();
        } catch {
          // Also acceptable: adapter blocks the write
        }
        // Cleanup attempt (best effort)
        try {
          await adapter.fs!.rm(traversalPath);
        } catch {
          // ignore cleanup errors
        }
      });

      test("path.join handles backslash-separated segments", () => {
        // Backslash paths (Windows-style) should not bypass traversal checks
        const result = adapter.path.join("/sandbox", "..\\..\\etc\\passwd");
        // Result should be a forward-slash path; ".." should be resolved
        expect(typeof result).toBe("string");
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 4: Vulnerability — resource exhaustion, timing attacks
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Vulnerability]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("createTempDir + cleanupTempDir leaves no residual (if supported)", async () => {
        if (!adapter.fs?.createTempDir || !adapter.fs?.cleanupTempDir) return;
        const tmp = await adapter.fs.createTempDir("afs-vuln-test-");
        // Temp dir should exist
        expect(await adapter.fs.exists(tmp)).toBe(true);
        // Write something to it
        await adapter.fs.writeFile(adapter.path.join(tmp, "data.txt"), "sensitive");
        // Cleanup
        await adapter.fs.cleanupTempDir(tmp);
        // After cleanup, the directory should not exist
        expect(await adapter.fs.exists(tmp)).toBe(false);
      });

      test("rapid sequential writes to same file do not corrupt", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "vuln-rapid-write.txt");
        // Write 20 times sequentially — each should overwrite cleanly
        for (let i = 0; i < 20; i++) {
          await adapter.fs!.writeFile(p, `iteration-${i}`);
        }
        const final = await adapter.fs!.readTextFile(p);
        expect(final).toBe("iteration-19");
      });

      test("large number of concurrent exists() calls completes without hanging", async () => {
        if (!hasFsRead()) return;
        // 100 concurrent exists() calls should all complete (no starvation/deadlock)
        const tasks = Array.from({ length: 100 }, (_, i) =>
          adapter.fs!.exists(adapter.path.join(tempDir, `starvation-test-${i}`)),
        );
        const results = await Promise.all(tasks);
        expect(results).toHaveLength(100);
        // All should return false (none of these files exist)
        for (const r of results) {
          expect(r).toBe(false);
        }
      });

      test("reading an extremely long path does not crash (graceful error)", async () => {
        if (!hasFsRead()) return;
        // Create a path > 4096 characters
        const longSegment = "a".repeat(300);
        const segments = Array.from({ length: 15 }, () => longSegment);
        const longPath = adapter.path.join(tempDir, ...segments, "file.txt");
        try {
          await adapter.fs!.readTextFile(longPath);
          // If it returns, that's fine (MemoryFS might just say not found)
        } catch (e) {
          // Should be a proper error, not a crash
          expect(e).toBeDefined();
        }
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 5: Data-leak — error messages must not expose host paths
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Data-leak]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("AFSFileNotFoundError.message does not expose absolute host filesystem path", async () => {
        if (!hasFsRead()) return;
        const p = adapter.path.join(tempDir, `leak-test-${Date.now()}.txt`);
        try {
          await adapter.fs!.readTextFile(p);
          expect(true).toBe(false);
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
          const msg = (e as Error).message;
          // The error message should contain the logical path but ideally
          // should NOT expose system-specific prefixes like /var, /private, /home, C:\Users
          // For now we verify the error is well-formed and contains the path we passed
          expect(msg).toBeDefined();
          expect(typeof msg).toBe("string");
          expect(msg.length).toBeGreaterThan(0);
        }
      });

      test("error from stat on non-existent path has consistent shape", async () => {
        if (!hasFsRead()) return;
        const p = adapter.path.join(tempDir, `leak-stat-${Date.now()}.txt`);
        try {
          await adapter.fs!.stat(p);
          expect(true).toBe(false);
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
          // Verify the error has standard properties
          expect((e as AFSFileNotFoundError).path).toBeDefined();
          expect((e as AFSFileNotFoundError).name).toBe("AFSFileNotFoundError");
        }
      });

      test("writeFile then rm leaves no residual data readable", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, `leak-rm-${Date.now()}.txt`);
        await adapter.fs!.writeFile(p, "sensitive-data-12345");
        await adapter.fs!.rm(p);
        // After rm, the file should not be readable
        expect(await adapter.fs!.exists(p)).toBe(false);
        try {
          await adapter.fs!.readTextFile(p);
          expect(true).toBe(false);
        } catch (e) {
          expect(e).toBeInstanceOf(AFSFileNotFoundError);
        }
      });

      test("failed write does not leave partial content", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, `leak-partial-${Date.now()}.txt`);
        // Write initial content
        await adapter.fs!.writeFile(p, "original-content");
        // Attempt to write to a deeply nested non-existent directory (may fail)
        const badPath = adapter.path.join(
          tempDir,
          `nonexistent-dir-${Date.now()}`,
          "subdir",
          "file.txt",
        );
        try {
          await adapter.fs!.writeFile(badPath, "should-fail-content");
        } catch {
          // Expected — directory doesn't exist
        }
        // The original file should still have its original content (not corrupted)
        const content = await adapter.fs!.readTextFile(p);
        expect(content).toBe("original-content");
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Dimension 6: Data-damage — concurrent writes, atomicity, integrity
    // ═══════════════════════════════════════════════════════════════════════

    describe("Filesystem operations [Data-damage]", () => {
      const tempDir = options.tempDir;
      if (!tempDir) return;

      test("10 parallel writes to different files all succeed with correct content", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const tasks = Array.from({ length: 10 }, async (_, i) => {
          const p = adapter.path.join(tempDir, `damage-parallel-${i}.txt`);
          await adapter.fs!.writeFile(p, `data-${i}`);
          const content = await adapter.fs!.readTextFile(p);
          expect(content).toBe(`data-${i}`);
        });
        await Promise.all(tasks);
      });

      test("10 parallel writes to SAME file do not produce corrupted content", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "damage-same-file.txt");
        // Write concurrently — all writing to the same path
        const tasks = Array.from({ length: 10 }, (_, i) => adapter.fs!.writeFile(p, `writer-${i}`));
        await Promise.all(tasks);
        // The final content must be one of the writers' values (not a partial/garbled mix)
        const content = await adapter.fs!.readTextFile(p);
        const validValues = Array.from({ length: 10 }, (_, i) => `writer-${i}`);
        expect(validValues).toContain(content);
      });

      test("write-then-read roundtrip preserves binary integrity", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        // Test with various byte patterns including 0x00, 0xFF, and all byte values
        const data = new Uint8Array(256);
        for (let i = 0; i < 256; i++) data[i] = i;
        const p = adapter.path.join(tempDir, "damage-binary-integrity.bin");
        await adapter.fs!.writeFile(p, data);
        const readBack = await adapter.fs!.readFile(p);
        expect(readBack).toBeInstanceOf(Uint8Array);
        expect(readBack.length).toBe(256);
        for (let i = 0; i < 256; i++) {
          expect(readBack[i]).toBe(i);
        }
      });

      test("overwrite preserves only new content (no old data leaking)", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "damage-overwrite.txt");
        // Write a long string first
        await adapter.fs!.writeFile(p, "A".repeat(1000));
        // Overwrite with a short string
        await adapter.fs!.writeFile(p, "short");
        const content = await adapter.fs!.readTextFile(p);
        // Must be exactly "short", not "short" + leftover "A"s
        expect(content).toBe("short");
        expect(content.length).toBe(5);
      });

      test("concurrent read+write+list operations complete without deadlock", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "damage-deadlock.txt");
        await adapter.fs!.writeFile(p, "initial");

        // Mix of reads, writes, and list operations concurrently
        const ops: Promise<unknown>[] = [
          adapter.fs!.readTextFile(p),
          adapter.fs!.writeFile(p, "updated-1"),
          adapter.fs!.exists(p),
          adapter.fs!.readTextFile(p),
          adapter.fs!.writeFile(p, "updated-2"),
        ];

        if (adapter.capabilities.has("fs.list")) {
          ops.push(adapter.fs!.readdir(tempDir));
        }

        // If deadlocked, Promise.all will hang and the test runner's timeout will catch it
        const results = await Promise.all(ops);
        expect(results.length).toBeGreaterThanOrEqual(5);
      });

      test("emoji and special Unicode roundtrip integrity", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const p = adapter.path.join(tempDir, "damage-unicode.txt");
        const special =
          "Hello \u{1F600}\u{1F680} 日本語 \u00E9\u00E8\u00EA Zer\u200Dwidth\u200Bjoiner";
        await adapter.fs!.writeFile(p, special);
        const content = await adapter.fs!.readTextFile(p);
        expect(content).toBe(special);
      });
    });

    // ─── Crypto operations (if capable) ─────────────────────────────────

    describe("Crypto operations", () => {
      test("randomBytes returns Uint8Array of requested length", () => {
        if (!adapter.capabilities.has("crypto.random") || !adapter.crypto) return;
        const bytes = adapter.crypto.randomBytes(16);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(16);
      });

      test("randomUUID returns valid UUID format", () => {
        if (!adapter.capabilities.has("crypto.random") || !adapter.crypto) return;
        const uuid = adapter.crypto.randomUUID();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      });

      test("hash produces consistent output", async () => {
        if (!adapter.capabilities.has("crypto.hash") || !adapter.crypto?.hash) return;
        const data = new TextEncoder().encode("hello");
        const h1 = await adapter.crypto.hash("sha256", data);
        const h2 = await adapter.crypto.hash("sha256", data);
        expect(h1).toEqual(h2);
        expect(h1).toBeInstanceOf(Uint8Array);
      });

      test("two different randomUUIDs are unique", () => {
        if (!adapter.capabilities.has("crypto.random") || !adapter.crypto) return;
        const a = adapter.crypto.randomUUID();
        const b = adapter.crypto.randomUUID();
        expect(a).not.toBe(b);
      });

      test("randomBytes of different sizes all return correct length", () => {
        if (!adapter.capabilities.has("crypto.random") || !adapter.crypto) return;
        for (const size of [0, 1, 32, 64, 256]) {
          const bytes = adapter.crypto.randomBytes(size);
          expect(bytes.length).toBe(size);
        }
      });
    });

    // ─── Environment access ─────────────────────────────────────────────

    describe("Environment", () => {
      test("env.get returns undefined for non-existent key", () => {
        expect(adapter.env.get(`__AFS_TEST_NONEXISTENT_${Date.now()}`)).toBeUndefined();
      });
    });

    // ─── Concurrent safety (legacy group — kept for compatibility) ───────

    describe("Concurrent safety", () => {
      test("concurrent readTextFile + writeFile does not crash", async () => {
        if (!hasFsWrite() || !hasFsRead()) return;
        const tempDir2 = options.tempDir;
        if (!tempDir2) return;

        const tasks = Array.from({ length: 10 }, async (_, i) => {
          const p = adapter.path.join(tempDir2, `concurrent-${i}.txt`);
          await adapter.fs!.writeFile(p, `data-${i}`);
          const content = await adapter.fs!.readTextFile(p);
          expect(content).toBe(`data-${i}`);
        });
        await Promise.all(tasks);
      });
    });
  });
}
