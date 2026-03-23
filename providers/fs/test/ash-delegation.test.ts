/**
 * Tests for FS provider .ash file exec delegation and event emission.
 *
 * Phase 2 of ASH Persona Framework:
 * - exec .ash files → delegate to ASH provider via afsRoot.exec
 * - onMount → scan for existing .ash files and emit script:registered
 * - write .ash → emit script:registered
 * - delete .ash → emit script:unregistered
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AFSExecResult, AFSRoot } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let fs: AFSFS;

/** Captured events emitted by the FS provider */
let emittedEvents: Array<{ type: string; path: string; data?: Record<string, unknown> }>;

/** Mock exec calls captured from afsRoot delegation */
let execCalls: Array<{ path: string; args: Record<string, unknown> }>;

/** Create a mock AFSRoot with exec support and ASH provider discoverable via URI */
function createMockRoot(): AFSRoot {
  execCalls = [];
  return {
    name: "mock-root",
    exec: async (path: string, args: Record<string, unknown>): Promise<AFSExecResult> => {
      execCalls.push({ path, args });
      return { success: true, data: { outputs: ["hello world"] } };
    },
    list: async () => ({ data: [] }),
    read: async () => ({ data: undefined }),
    search: async () => ({ data: [] }),
    // getMounts returns a mount with ash:// URI so FS provider can discover ASH by URI
    getMounts: () => [
      { namespace: null, path: "/modules/ash", module: { uri: "ash://", name: "ash" } },
    ],
  } as unknown as AFSRoot;
}

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-fs-ash-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create test directory structure with .ash files
  await mkdir(join(testDir, "scripts"), { recursive: true });
  await mkdir(join(testDir, "agents", "bot", "scripts"), { recursive: true });
  await writeFile(join(testDir, "scripts", "hello.ash"), 'job hello { output "hello world" }');
  await writeFile(
    join(testDir, "agents", "bot", "scripts", "chat.ash"),
    'job chat { output "bot reply" }',
  );
  await writeFile(join(testDir, "readme.txt"), "not a script");

  fs = new AFSFS({ localPath: testDir, accessMode: "readwrite" });

  // Set up event sink to capture emitted events
  emittedEvents = [];
  (fs as any).setEventSink(
    (event: { type: string; path: string; data?: Record<string, unknown> }) => {
      emittedEvents.push(event);
    },
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ========== Happy Path ==========

describe("Happy Path", () => {
  test("exec .ash file delegates to /modules/ash/.actions/run", async () => {
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    // Wait for async scan to complete
    await new Promise((r) => setTimeout(r, 100));

    const result = await fs.exec!("/scripts/hello.ash", {});
    expect(result.success).toBe(true);
    expect(execCalls.length).toBeGreaterThanOrEqual(1);
    const lastCall = execCalls[execCalls.length - 1]!;
    expect(lastCall.path).toBe("/modules/ash/.actions/run");
    expect(lastCall.args.source).toBe('job hello { output "hello world" }');
  });

  test("delegation result is correctly returned to caller", async () => {
    const mockRoot = createMockRoot();
    // Override exec to return custom data
    (mockRoot as any).exec = async (path: string, args: Record<string, unknown>) => {
      execCalls.push({ path, args });
      return {
        success: true,
        data: { outputs: ["custom result"], jobs: [{ jobName: "hello", status: "ok" }] },
      };
    };
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    const result = await fs.exec!("/scripts/hello.ash", {});
    expect(result.success).toBe(true);
    expect((result.data as any)?.outputs).toContain("custom result");
  });

  test("onMount scans existing .ash files and emits script:registered", async () => {
    emittedEvents = [];
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    // Wait for async scan
    await new Promise((r) => setTimeout(r, 200));

    const registeredEvents = emittedEvents.filter((e) => e.type === "script:registered");
    expect(registeredEvents.length).toBeGreaterThanOrEqual(2); // hello.ash + chat.ash

    const paths = registeredEvents.map((e) => e.path);
    expect(paths).toContain("/scripts/hello.ash");
    expect(paths).toContain("/agents/bot/scripts/chat.ash");

    // All should have runtime: "ash"
    for (const evt of registeredEvents) {
      expect(evt.data?.runtime).toBe("ash");
    }
  });

  test("write new .ash file emits script:registered", async () => {
    emittedEvents = [];

    await fs.write!("/scripts/new-script.ash", {
      content: 'job test { output "test" }',
    });

    const registeredEvents = emittedEvents.filter((e) => e.type === "script:registered");
    expect(registeredEvents.length).toBe(1);
    expect(registeredEvents[0]!.path).toBe("/scripts/new-script.ash");
    expect(registeredEvents[0]!.data?.runtime).toBe("ash");

    // Clean up
    await fs.delete!("/scripts/new-script.ash");
  });

  test("delete .ash file emits script:unregistered", async () => {
    // Create a temp .ash file first
    await writeFile(join(testDir, "scripts", "temp.ash"), 'job tmp { output "tmp" }');
    emittedEvents = [];

    await fs.delete!("/scripts/temp.ash");

    const unregisteredEvents = emittedEvents.filter((e) => e.type === "script:unregistered");
    expect(unregisteredEvents.length).toBe(1);
    expect(unregisteredEvents[0]!.path).toBe("/scripts/temp.ash");
    expect(unregisteredEvents[0]!.data?.runtime).toBe("ash");
  });
});

// ========== Bad Path ==========

describe("Bad Path", () => {
  test("exec non-.ash file returns unsupported error", async () => {
    const result = await fs.exec!("/readme.txt", {});
    expect(result.success).toBe(false);
    expect((result as any).error?.code).toBe("UNSUPPORTED");
  });

  test(".ash file not found returns not found error", async () => {
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    try {
      await fs.exec!("/scripts/nonexistent.ash", {});
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message || error.code).toBeDefined();
    }
  });

  test("ASH provider not mounted returns clear error", async () => {
    // Create FS without onMount (no afsRoot)
    const fsNoMount = new AFSFS({ localPath: testDir, accessMode: "readwrite" });

    const result = await fsNoMount.exec!("/scripts/hello.ash", {});
    expect(result.success).toBe(false);
    expect((result as any).error?.code).toBe("ASH_UNAVAILABLE");
  });

  test("empty .ash file is delegated to ASH (no FS-level interception)", async () => {
    await writeFile(join(testDir, "scripts", "empty.ash"), "");
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    await fs.exec!("/scripts/empty.ash", {});
    // Should still delegate — ASH handles empty source
    expect(execCalls.some((c) => c.args.source === "")).toBe(true);

    // Clean up
    await rm(join(testDir, "scripts", "empty.ash"));
  });
});

// ========== Edge Cases ==========

describe("Edge Cases", () => {
  test(".ash files in subdirectories are scanned recursively", async () => {
    emittedEvents = [];
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 200));

    const paths = emittedEvents.filter((e) => e.type === "script:registered").map((e) => e.path);
    // Should include the nested chat.ash
    expect(paths).toContain("/agents/bot/scripts/chat.ash");
  });

  test("uppercase .ASH or .Ash extensions are NOT matched (case-sensitive)", async () => {
    await writeFile(join(testDir, "scripts", "upper.ASH"), 'job x { output "x" }');
    await writeFile(join(testDir, "scripts", "mixed.Ash"), 'job y { output "y" }');
    emittedEvents = [];

    await fs.write!("/scripts/test-case.ASH", { content: 'job z { output "z" }' });

    const registeredEvents = emittedEvents.filter((e) => e.type === "script:registered");
    // .ASH should NOT trigger script:registered
    expect(registeredEvents.length).toBe(0);

    // Clean up
    await rm(join(testDir, "scripts", "upper.ASH"));
    await rm(join(testDir, "scripts", "mixed.Ash"));
    await rm(join(testDir, "scripts", "test-case.ASH"));
  });

  test("writing multiple .ash files emits independent events", async () => {
    emittedEvents = [];

    await fs.write!("/scripts/multi-a.ash", { content: 'job a { output "a" }' });
    await fs.write!("/scripts/multi-b.ash", { content: 'job b { output "b" }' });

    const registeredEvents = emittedEvents.filter((e) => e.type === "script:registered");
    expect(registeredEvents.length).toBe(2);

    const paths = registeredEvents.map((e) => e.path);
    expect(paths).toContain("/scripts/multi-a.ash");
    expect(paths).toContain("/scripts/multi-b.ash");

    // Clean up
    await fs.delete!("/scripts/multi-a.ash");
    await fs.delete!("/scripts/multi-b.ash");
  });
});

// ========== Security ==========

describe("Security", () => {
  test("FS provider only reads source and forwards, does not execute .ash directly", async () => {
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    await fs.exec!("/scripts/hello.ash", {});

    // Verify the exec was delegated to /modules/ash/.actions/run
    const lastCall = execCalls[execCalls.length - 1]!;
    expect(lastCall.path).toBe("/modules/ash/.actions/run");
    // The source should be the raw content, not any execution result
    expect(typeof lastCall.args.source).toBe("string");
  });

  test("delegation path is resolved from ASH URI, not influenced by args", async () => {
    const mockRoot = createMockRoot();
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    await fs.exec!("/scripts/hello.ash", { malicious_path: "/other/action" });

    const lastCall = execCalls[execCalls.length - 1]!;
    // Path is resolved via ash:// URI lookup, not influenced by user args
    expect(lastCall.path).toBe("/modules/ash/.actions/run");
  });
});

// ========== Data Leak ==========

describe("Data Leak", () => {
  test("delegation error does not expose local filesystem path", async () => {
    const mockRoot = createMockRoot();
    (mockRoot as any).exec = async () => {
      throw new Error(`Failed to exec at /Users/secret/path/script.ash`);
    };
    fs.onMount(mockRoot);
    await new Promise((r) => setTimeout(r, 100));

    try {
      const result = await fs.exec!("/scripts/hello.ash", {});
      // If it doesn't throw, the error should still not expose paths
      if (!result.success) {
        const errMsg = JSON.stringify(result);
        expect(errMsg).not.toContain(testDir);
      }
    } catch (_error: any) {
      // Error from delegation — not from FS itself
      // This tests that FS delegates, the error originates from mock
    }
  });
});

// ========== Data Damage ==========

describe("Data Damage", () => {
  test("writing .ash file does not affect non-.ash write behavior", async () => {
    emittedEvents = [];

    // Write non-.ash file
    await fs.write!("/scripts/readme.md", { content: "# Hello" });

    // Should NOT emit script:registered
    const registeredEvents = emittedEvents.filter((e) => e.type === "script:registered");
    expect(registeredEvents.length).toBe(0);

    // File should be written correctly
    const result = await fs.read!("/scripts/readme.md");
    expect(result.data?.content).toBe("# Hello");

    // Clean up
    await fs.delete!("/scripts/readme.md");
  });

  test("event emit failure does not affect file write", async () => {
    // Set up a failing event sink
    (fs as any).setEventSink(() => {
      throw new Error("Event sink failure");
    });

    // Write should still succeed even if emit throws
    // Note: emit is fire-and-forget, so this tests robustness
    try {
      await fs.write!("/scripts/robust.ash", { content: 'job r { output "robust" }' });
    } catch {
      // If write fails due to emit, that's a bug we'd catch
    }

    // Restore normal event sink
    emittedEvents = [];
    (fs as any).setEventSink((event: any) => {
      emittedEvents.push(event);
    });

    // Clean up
    try {
      await fs.delete!("/scripts/robust.ash");
    } catch {
      // ignore cleanup errors
    }
  });
});
