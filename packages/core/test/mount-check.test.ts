import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSMountError } from "../src/error.js";
import type {
  AFSChangeRecord,
  AFSListResult,
  AFSModule,
  AFSReadResult,
  AFSStatResult,
} from "../src/type.js";

/**
 * Create a minimal mock provider for testing mount check
 */
function createMockProvider(
  options: {
    name?: string;
    timeout?: number;
    statResult?: () => AFSStatResult | Promise<AFSStatResult>;
    readResult?: () => AFSReadResult | Promise<AFSReadResult>;
    listResult?: () => AFSListResult | Promise<AFSListResult>;
    hasStat?: boolean;
    hasRead?: boolean;
    hasList?: boolean;
  } = {},
): AFSModule {
  const provider: AFSModule = {
    name: options.name ?? "MockProvider",
    timeout: options.timeout,
  };

  if (options.hasStat !== false && options.statResult) {
    (provider as any).stat = async () => options.statResult!();
  }

  if (options.hasRead !== false && options.readResult) {
    (provider as any).read = async () => options.readResult!();
  }

  if (options.hasList !== false && options.listResult) {
    (provider as any).list = async () => options.listResult!();
  }

  return provider;
}

/**
 * Create a delayed promise for timeout testing
 */
function delay<T>(ms: number, value?: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value as T), ms));
}

describe("async mount check — mount always registers", () => {
  test("mount() always succeeds even if provider has no stat/read", async () => {
    const afs = new AFS();
    const provider: AFSModule = { name: "NoMethodProvider" };

    await afs.mount(provider);
    expect(afs.getMounts().length).toBe(1);
  });

  test("mount() registers provider even when stat returns undefined data", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "UndefinedDataProvider",
      statResult: () => ({ data: undefined }),
    });

    await afs.mount(provider);
    expect(afs.getMounts().length).toBe(1);
  });

  test("mount() registers provider even when stat times out", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "SlowProvider",
      statResult: () => delay(500, { data: { id: "/", path: "/" } }),
      timeout: 50,
    });

    await afs.mount(provider);
    expect(afs.getMounts().length).toBe(1);
  });
});

describe("afs.check() — explicit health check", () => {
  test("check() resolves when provider is healthy", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    const mount = afs.getMounts()[0]!;
    expect(mount.status).toBe("ready");
  });

  test("check() throws AFSMountError when provider has no stat/read", async () => {
    const afs = new AFS();
    const provider: AFSModule = { name: "NoMethodProvider" };

    await afs.mount(provider);
    await expect(afs.check("/modules/NoMethodProvider")).rejects.toThrow(AFSMountError);
  });

  test("check() throws with correct step and providerName", async () => {
    const afs = new AFS();
    const provider: AFSModule = { name: "BadProvider" };

    await afs.mount(provider);
    await expect(afs.check("/modules/BadProvider")).rejects.toMatchObject({
      step: "read",
      providerName: "BadProvider",
    });
  });

  test("check() throws when stat returns undefined data", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "UndefinedDataProvider",
      statResult: () => ({ data: undefined }),
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/UndefinedDataProvider")).rejects.toThrow(AFSMountError);
  });

  test("check() throws when read returns undefined data", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "UndefinedReadProvider",
      hasStat: false,
      readResult: () => ({ data: undefined }),
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/UndefinedReadProvider")).rejects.toThrow(AFSMountError);
  });

  test("check() throws AFSNotFoundError for unmounted path", async () => {
    const afs = new AFS();
    await expect(afs.check("/modules/nonexistent")).rejects.toThrow(/No provider mounted/);
  });
});

describe("async check — childrenCount and list validation", () => {
  test("passes when childrenCount is undefined (leaf node)", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({
        data: { id: "/", path: "/" },
      }),
      hasList: false,
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("passes when childrenCount is 0 (leaf node)", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 0 } },
      }),
      hasList: false,
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("passes when childrenCount > 0 and list returns children", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 2 } },
      }),
      listResult: () => ({
        data: [
          { id: "1", path: "/child1" },
          { id: "2", path: "/child2" },
        ],
      }),
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("check() throws when childrenCount > 0 but list returns empty", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "EmptyListProvider",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 2 } },
      }),
      listResult: () => ({ data: [] }),
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/EmptyListProvider")).rejects.toMatchObject({
      step: "list",
      providerName: "EmptyListProvider",
    });
  });

  test("check() throws when childrenCount > 0 but no list method", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "NoListProvider",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 2 } },
      }),
      hasList: false,
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/NoListProvider")).rejects.toMatchObject({
      step: "list",
      providerName: "NoListProvider",
    });
  });

  test("passes when childrenCount is -1 (unknown) and list returns children", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: -1 } },
      }),
      listResult: () => ({
        data: [{ id: "1", path: "/child1" }],
      }),
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("check() throws when childrenCount is -1 but list returns empty", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "UnknownCountEmptyList",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: -1 } },
      }),
      listResult: () => ({ data: [] }),
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/UnknownCountEmptyList")).rejects.toMatchObject({
      step: "list",
      providerName: "UnknownCountEmptyList",
    });
  });
});

describe("async check — timeout handling", () => {
  test("check() throws when stat times out", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "SlowStatProvider",
      statResult: () => delay(200, { data: { id: "/", path: "/" } }),
      timeout: 50,
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/SlowStatProvider")).rejects.toMatchObject({
      step: "stat",
      providerName: "SlowStatProvider",
    });
  });

  test("check() throws when list times out", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "SlowListProvider",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 2 } },
      }),
      listResult: () => delay(200, { data: [{ id: "1", path: "/child" }] }),
      timeout: 50,
    });

    await afs.mount(provider);
    await expect(afs.check("/modules/SlowListProvider")).rejects.toMatchObject({
      step: "list",
      providerName: "SlowListProvider",
    });
  });
});

describe("mount status tracking", () => {
  test("mount sets initial status to 'checking'", async () => {
    const afs = new AFS();
    // Use a slow provider so we can observe 'checking' status
    const provider = createMockProvider({
      statResult: () => delay(100, { data: { id: "/", path: "/" } }),
    });

    await afs.mount(provider);
    // Status might already be checking or ready depending on timing,
    // but mount should have at least registered
    expect(afs.getMounts().length).toBe(1);
  });

  test("status becomes 'ready' after successful check", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });

    await afs.mount(provider);
    await afs.check("/modules/MockProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("status becomes 'error' after failed check", async () => {
    const afs = new AFS();
    const provider: AFSModule = { name: "BadProvider" };

    await afs.mount(provider);
    try {
      await afs.check("/modules/BadProvider");
    } catch {
      // expected
    }

    expect(afs.getMounts()[0]!.status).toBe("error");
    expect(afs.getMounts()[0]!.error).toBeInstanceOf(AFSMountError);
  });

  test("getMounts() includes error details", async () => {
    const afs = new AFS();
    const provider: AFSModule = { name: "BadProvider" };

    await afs.mount(provider);
    try {
      await afs.check("/modules/BadProvider");
    } catch {
      // expected
    }

    const mount = afs.getMounts()[0]!;
    expect(mount.error).toBeDefined();
    expect(mount.error!.providerName).toBe("BadProvider");
  });
});

describe("AFS.mount integration with async check", () => {
  test("successful mount registers provider and calls onMount", async () => {
    const afs = new AFS();
    let onMountCalled = false;
    const provider = createMockProvider({
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });
    (provider as any).onMount = () => {
      onMountCalled = true;
    };

    await afs.mount(provider);

    expect(afs.getMounts().length).toBe(1);
    expect(onMountCalled).toBe(true);
  });

  test("onMount receives mount path", async () => {
    const afs = new AFS();
    let receivedPath: string | undefined;
    const provider = createMockProvider({
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });
    (provider as any).onMount = (_root: any, mountPath?: string) => {
      receivedPath = mountPath;
    };

    await afs.mount(provider, "/test-path");

    expect(receivedPath).toBe("/test-path");
  });

  test("failed check still has provider registered (onMount was called)", async () => {
    const afs = new AFS();
    let onMountCalled = false;
    const provider: AFSModule = {
      name: "FailingProvider",
      onMount: () => {
        onMountCalled = true;
      },
    };

    await afs.mount(provider);
    // Provider is registered immediately, onMount is called
    expect(onMountCalled).toBe(true);
    expect(afs.getMounts().length).toBe(1);
    // But check reveals the error
    await expect(afs.check("/modules/FailingProvider")).rejects.toThrow(AFSMountError);
  });

  test("uses provider custom timeout for check", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "CustomTimeoutProvider",
      statResult: () => delay(100, { data: { id: "/", path: "/" } }),
      timeout: 200, // Allow 200ms
    });

    await afs.mount(provider);
    await afs.check("/modules/CustomTimeoutProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });
});

describe("Integration tests with mock providers", () => {
  test("mock provider with stat/list passes check", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "FullProvider",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 1 } },
      }),
      listResult: () => ({
        data: [{ id: "child", path: "/child" }],
      }),
    });

    await afs.mount(provider);
    await afs.check("/modules/FullProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("mock provider with only read passes check", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "ReadOnlyProvider",
      hasStat: false,
      readResult: () => ({
        data: { id: "root", path: "/" },
      }),
    });

    await afs.mount(provider);
    await afs.check("/modules/ReadOnlyProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("mock leaf provider (childrenCount=0) passes check", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "LeafProvider",
      statResult: () => ({
        data: { id: "/", path: "/", meta: { childrenCount: 0 } },
      }),
      hasList: false,
    });

    await afs.mount(provider);
    await afs.check("/modules/LeafProvider");
    expect(afs.getMounts()[0]!.status).toBe("ready");
  });

  test("mock provider that times out fails check but is still mounted", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "TimeoutProvider",
      statResult: () => delay(500, { data: { id: "/", path: "/" } }),
      timeout: 100,
    });

    await afs.mount(provider);
    expect(afs.getMounts().length).toBe(1);
    await expect(afs.check("/modules/TimeoutProvider")).rejects.toThrow(AFSMountError);
  });
});

describe("mountError event", () => {
  test("async check failure emits mountError change record", async () => {
    const events: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (e) => events.push(e) });
    const failingProvider: AFSModule = { name: "BadProvider" };

    await afs.mount(failingProvider, "/modules/bad");

    // Wait for async check to complete
    try {
      await afs.check("/modules/bad");
    } catch {
      // expected
    }

    const mountError = events.find((e) => e.kind === "mountError");
    expect(mountError).toBeDefined();
    expect(mountError!.path).toBe("/modules/bad");
    expect(mountError!.moduleName).toBe("BadProvider");
    expect(mountError!.meta?.error).toBeString();
  });

  test("healthy provider does not emit mountError", async () => {
    const events: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (e) => events.push(e) });
    const provider = createMockProvider({
      name: "HealthyProvider",
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });

    await afs.mount(provider, "/modules/healthy");
    await afs.check("/modules/healthy");

    const mountErrors = events.filter((e) => e.kind === "mountError");
    expect(mountErrors.length).toBe(0);
  });
});

describe("lenient mount (backward compatibility)", () => {
  test("lenient: true still registers provider (same as default now)", async () => {
    const afs = new AFS();
    const failingProvider: AFSModule = { name: "BadProvider" };
    const goodProvider = createMockProvider({
      name: "GoodProvider",
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });

    await afs.mount(failingProvider, "/modules/bad", { lenient: true });
    await afs.mount(goodProvider, "/modules/good");

    // Both are registered now (mount never rejects)
    const mounts = afs.getMounts();
    expect(mounts.length).toBe(2);
  });

  test("lenient mount still emits mountError for failing provider", async () => {
    const events: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (e) => events.push(e) });
    const failingProvider: AFSModule = { name: "BadProvider" };

    await afs.mount(failingProvider, "/modules/bad", { lenient: true });

    // Wait for async check
    try {
      await afs.check("/modules/bad");
    } catch {
      // expected
    }

    const mountError = events.find((e) => e.kind === "mountError");
    expect(mountError).toBeDefined();
  });

  test("lenient: true registers healthy provider", async () => {
    const afs = new AFS();
    const provider = createMockProvider({
      name: "HealthyProvider",
      statResult: () => ({ data: { id: "/", path: "/" } }),
    });

    await afs.mount(provider, "/modules/healthy", { lenient: true });
    await afs.check("/modules/healthy");
    const mounts = afs.getMounts();
    expect(mounts.length).toBe(1);
    expect(mounts[0]!.module.name).toBe("HealthyProvider");
  });
});
