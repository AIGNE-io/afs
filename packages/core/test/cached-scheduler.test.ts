/**
 * Tests for cached() scheduler integration — periodic refresh via cron.
 *
 * When a cached provider has refreshInterval > 0 and a scheduler is mounted,
 * onMount registers a cron job. close() unregisters it (best-effort).
 */

import { describe, expect, mock, test } from "bun:test";
import { ttl } from "../src/cache-policy.js";
import { cached, createMemoryStore, intervalToCron } from "../src/cached.js";
import type { AFSExecOptions, AFSModule, AFSReadResult, AFSRoot } from "../src/type.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function createSource(name = "source"): AFSModule & { callCount: number } {
  let callCount = 0;
  return {
    name,
    accessMode: "readonly" as const,
    read: mock(async (path: string): Promise<AFSReadResult> => {
      callCount++;
      return { data: { id: path, path, content: `data-${path}` } } as any;
    }),
    get callCount() {
      return callCount;
    },
  } as any;
}

function createMockRoot(
  execFn?: (path: string, args: Record<string, any>, options: AFSExecOptions) => Promise<any>,
): AFSRoot {
  return {
    exec: execFn ?? mock(async () => ({ success: true })),
  } as unknown as AFSRoot;
}

// ─── intervalToCron ─────────────────────────────────────────────────

describe("intervalToCron", () => {
  test("3600 → hourly", () => {
    expect(intervalToCron(3600)).toBe("0 * * * *");
  });

  test("86400 → daily at 3am", () => {
    expect(intervalToCron(86400)).toBe("0 3 * * *");
  });

  test("1800 → every 30 minutes", () => {
    expect(intervalToCron(1800)).toBe("*/30 * * * *");
  });

  test("< 60s → every minute", () => {
    expect(intervalToCron(30)).toBe("* * * * *");
  });

  test("7200 → every 2 hours", () => {
    expect(intervalToCron(7200)).toBe("0 */2 * * *");
  });

  test("300 → every 5 minutes", () => {
    expect(intervalToCron(300)).toBe("*/5 * * * *");
  });

  test("172800 (2 days) → daily at 3am", () => {
    expect(intervalToCron(172800)).toBe("0 3 * * *");
  });
});

// ─── Happy Path ─────────────────────────────────────────────────────

describe("cached scheduler — Happy Path", () => {
  test("mount with refreshInterval + scheduler → cron registered", async () => {
    const source = createSource();
    const execCalls: Array<{ path: string; args: any }> = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    provider.onMount!(root, "/my-provider");

    // Wait for async exec to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls.length).toBe(1);
    expect(execCalls[0]!.path).toBe("/scheduler/.actions/schedule");
    expect(execCalls[0]!.args.name).toBe("cache-refresh:/my-provider");
    expect(execCalls[0]!.args.cron).toBe("0 * * * *");
    expect(execCalls[0]!.args.task).toBe("/my-provider/.actions/refresh");
  });

  test("refresh action clears cache, next read re-fetches", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    // First read: cache miss
    await provider.read!("test");
    expect(source.callCount).toBe(1);

    // Second read: cache hit
    await provider.read!("test");
    expect(source.callCount).toBe(1);

    // Trigger refresh (what scheduler would do)
    await provider.exec!("/.actions/refresh", {}, {} as AFSExecOptions);

    // Third read: re-fetches after refresh
    await provider.read!("test");
    expect(source.callCount).toBe(2);
  });

  test("source onMount also called", async () => {
    const onMountCalled = mock(() => {});
    const source = {
      ...createSource(),
      onMount: onMountCalled,
    };

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    const root = createMockRoot();
    provider.onMount!(root, "/test");

    expect(onMountCalled).toHaveBeenCalledTimes(1);
  });
});

// ─── Bad Path ───────────────────────────────────────────────────────

describe("cached scheduler — Bad Path", () => {
  test("no scheduler mounted → no error", async () => {
    const source = createSource();
    const root = createMockRoot(async () => {
      throw new Error("scheduler not found");
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    // Should not throw
    provider.onMount!(root, "/test");
    await new Promise((r) => setTimeout(r, 10));

    // Provider still works
    const result = await provider.read!("test");
    expect(result.data).toBeDefined();
  });

  test("refreshInterval = 0 → no cron registered", async () => {
    const source = createSource();
    const execCalls: any[] = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 0,
    });

    provider.onMount!(root, "/test");
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls.length).toBe(0);
  });

  test("refreshInterval negative → no cron registered", async () => {
    const source = createSource();
    const execCalls: any[] = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: -100,
    });

    provider.onMount!(root, "/test");
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls.length).toBe(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("cached scheduler — Edge Cases", () => {
  test("close unregisters cron (best-effort)", async () => {
    const source = createSource();
    const execCalls: Array<{ path: string; args: any }> = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    provider.onMount!(root, "/my-provider");
    await new Promise((r) => setTimeout(r, 10));

    // Now close — should unschedule
    await provider.close!();
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls.length).toBe(2);
    expect(execCalls[1]!.path).toBe("/scheduler/.actions/unschedule");
    expect(execCalls[1]!.args.name).toBe("cache-refresh:/my-provider");
  });

  test("multiple cached providers get unique cron names", async () => {
    const execCalls: Array<{ path: string; args: any }> = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const p1 = cached(createSource("s1"), {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    const p2 = cached(createSource("s2"), {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    p1.onMount!(root, "/provider-a");
    p2.onMount!(root, "/provider-b");
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls.length).toBe(2);
    expect(execCalls[0]!.args.name).toBe("cache-refresh:/provider-a");
    expect(execCalls[1]!.args.name).toBe("cache-refresh:/provider-b");
  });

  test("no refreshInterval → onMount still delegates to source", () => {
    const onMountCalled = mock(() => {});
    const source = {
      ...createSource(),
      onMount: onMountCalled,
    };

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    const root = createMockRoot();
    provider.onMount!(root, "/test");

    expect(onMountCalled).toHaveBeenCalledTimes(1);
  });

  test("very short refreshInterval (<60s) → capped at every minute", async () => {
    const source = createSource();
    const execCalls: Array<{ path: string; args: any }> = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 10,
    });

    provider.onMount!(root, "/test");
    await new Promise((r) => setTimeout(r, 10));

    expect(execCalls[0]!.args.cron).toBe("* * * * *");
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("cached scheduler — Security", () => {
  test("cron job targets own mount path's refresh action", async () => {
    const execCalls: Array<{ path: string; args: any }> = [];
    const root = createMockRoot(async (path, args) => {
      execCalls.push({ path, args });
      return { success: true };
    });

    const provider = cached(createSource(), {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    provider.onMount!(root, "/secure/path");
    await new Promise((r) => setTimeout(r, 10));

    // Verify the task path targets this specific mount
    expect(execCalls[0]!.args.task).toBe("/secure/path/.actions/refresh");
    // Name includes mount path for uniqueness
    expect(execCalls[0]!.args.name).toBe("cache-refresh:/secure/path");
  });
});

// ─── Data Damage ────────────────────────────────────────────────────

describe("cached scheduler — Data Damage", () => {
  test("close unschedule failure does not crash", async () => {
    const source = createSource();
    let callCount = 0;
    const root = createMockRoot(async () => {
      callCount++;
      if (callCount > 1) throw new Error("unschedule failed");
      return { success: true };
    });

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 3600,
    });

    provider.onMount!(root, "/test");
    await new Promise((r) => setTimeout(r, 10));

    // close should not throw even if unschedule fails
    await provider.close!();
    await new Promise((r) => setTimeout(r, 10));
  });
});
