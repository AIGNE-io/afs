import { describe, expect, test } from "bun:test";
import { AFS, type AFSChangeRecord } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

/**
 * E2E tests for change events.
 * Tests the full lifecycle of change notifications across
 * multiple providers, namespaces, and operation sequences.
 */
describe("change events e2e", () => {
  test("full lifecycle: mount → write → delete → unmount", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    // 1. Mount
    const mod = new JSONModule({
      name: "lifecycle",
      data: { file1: { content: "hello" } },
      accessMode: "readwrite",
    });
    await afs.mount(mod);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("mount");

    // 2. Write
    await afs.write("/modules/lifecycle/file2/content", { content: "world" });
    expect(records).toHaveLength(2);
    expect(records[1]!.kind).toBe("write");

    // 3. Delete
    await afs.delete("/modules/lifecycle/file1", { recursive: true });
    expect(records).toHaveLength(3);
    expect(records[2]!.kind).toBe("delete");

    // 4. Unmount
    afs.unmount("/modules/lifecycle");
    expect(records).toHaveLength(4);
    expect(records[3]!.kind).toBe("unmount");

    // Verify chronological order
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.timestamp).toBeGreaterThanOrEqual(records[i - 1]!.timestamp);
    }
  });

  test("multi-provider: events from different modules are interleaved correctly", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const modA = new JSONModule({ name: "mod-a", data: {}, accessMode: "readwrite" });
    const modB = new JSONModule({ name: "mod-b", data: {}, accessMode: "readwrite" });

    await afs.mount(modA);
    await afs.mount(modB);

    await afs.write("/modules/mod-a/x/content", { content: "a" });
    await afs.write("/modules/mod-b/y/content", { content: "b" });

    expect(records.map((r) => `${r.kind}:${r.moduleName ?? r.path}`)).toEqual([
      "mount:mod-a",
      "mount:mod-b",
      "write:mod-a",
      "write:mod-b",
    ]);
  });

  test("namespace isolation: events include correct namespace context", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const modDefault = new JSONModule({ name: "shared", data: {}, accessMode: "readwrite" });
    const modNs = new JSONModule({ name: "shared", data: {}, accessMode: "readwrite" });

    await afs.mount(modDefault, "/tools/shared");
    await afs.mount(modNs, "/tools/shared", { namespace: "tenant-1" });

    expect(records).toHaveLength(2);
    expect(records[0]!.namespace).toBeNull();
    expect(records[1]!.namespace).toBe("tenant-1");

    // Write to namespaced module
    await afs.write("$afs:tenant-1/tools/shared/doc/content", { content: "ns-data" });
    const writeEvent = records.find((r) => r.kind === "write");
    expect(writeEvent).toBeDefined();
    expect(writeEvent!.path).toContain("shared");

    // Unmount namespaced module
    afs.unmount("/tools/shared", "tenant-1");
    const unmountEvent = records.find((r) => r.kind === "unmount" && r.namespace === "tenant-1");
    expect(unmountEvent).toBeDefined();
    expect(unmountEvent!.moduleName).toBe("shared");
  });

  // Skip: Constructor modules cannot await async mount check.
  // Use explicit await afs.mount() instead of passing modules to constructor.
  test.skip("constructor modules + subsequent operations produce continuous event stream", async () => {
    const records: AFSChangeRecord[] = [];
    const initMod = new JSONModule({
      name: "init",
      data: { seed: { content: "v0" } },
      accessMode: "readwrite",
    });

    const afs = new AFS({ modules: [initMod], onChange: (r) => records.push(r) });

    // Constructor mount event
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("mount");

    // Subsequent write
    await afs.write("/modules/init/update/content", { content: "v1" });
    expect(records).toHaveLength(2);
    expect(records[1]!.kind).toBe("write");
  });

  test("error resilience: listener crash does not break multi-step workflow", async () => {
    let callCount = 0;
    const afs = new AFS({
      onChange: () => {
        callCount++;
        throw new Error(`crash #${callCount}`);
      },
    });

    const mod = new JSONModule({
      name: "resilient",
      data: { old: { content: "x" } },
      accessMode: "readwrite",
    });

    // All operations succeed despite listener crashing every time
    await afs.mount(mod);
    const writeResult = await afs.write("/modules/resilient/new/content", { content: "y" });
    await afs.delete("/modules/resilient/old", { recursive: true });
    afs.unmount("/modules/resilient");

    expect(callCount).toBe(4); // mount, write, delete, unmount
    expect(writeResult.data).toBeDefined();
  });

  test("mount replace triggers new mount event without unmount", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod1 = new JSONModule({
      name: "rep",
      data: { v: { content: "1" } },
      accessMode: "readwrite",
    });
    const mod2 = new JSONModule({
      name: "rep",
      data: { v: { content: "2" } },
      accessMode: "readwrite",
    });

    await afs.mount(mod1, "/tools/rep");
    await afs.mount(mod2, "/tools/rep", { replace: true });

    // Should be two mount events, no unmount
    expect(records.filter((r) => r.kind === "mount")).toHaveLength(2);
    expect(records.filter((r) => r.kind === "unmount")).toHaveLength(0);

    // Verify the replacement worked — write goes to mod2
    await afs.write("/tools/rep/new/content", { content: "from-mod2" });
    expect(records).toHaveLength(3);
  });

  test("failed operations do not emit events", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const roMod = new JSONModule({
      name: "ro",
      data: { x: { content: "locked" } },
      accessMode: "readonly",
    });
    await afs.mount(roMod);
    records.length = 0; // clear mount event

    // Write to readonly → should throw, no event
    await expect(afs.write("/modules/ro/y", { content: "fail" })).rejects.toThrow();
    expect(records).toHaveLength(0);

    // Delete from readonly → should throw, no event
    await expect(afs.delete("/modules/ro/x")).rejects.toThrow();
    expect(records).toHaveLength(0);

    // Unmount non-existent → returns false, no event
    const result = afs.unmount("/modules/nonexistent");
    expect(result).toBe(false);
    expect(records).toHaveLength(0);
  });

  test("high-volume: 50 sequential writes produce 50 ordered events", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({ name: "bulk", data: {}, accessMode: "readwrite" });
    await afs.mount(mod);
    records.length = 0;

    for (let i = 0; i < 50; i++) {
      await afs.write(`/modules/bulk/item-${i}/content`, { content: `val-${i}` });
    }

    const writeEvents = records.filter((r) => r.kind === "write");
    expect(writeEvents).toHaveLength(50);

    // Timestamps are non-decreasing
    for (let i = 1; i < writeEvents.length; i++) {
      expect(writeEvents[i]!.timestamp).toBeGreaterThanOrEqual(writeEvents[i - 1]!.timestamp);
    }
  });
});
