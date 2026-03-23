import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSChangeListener, type AFSChangeRecord } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

// ============================================================
// Phase 1: Type compilation tests
// ============================================================

describe("AFSChangeRecord types", () => {
  test("AFSChangeRecord accepts all five kinds", async () => {
    const records: AFSChangeRecord[] = [
      { kind: "write", path: "/foo", moduleName: "test", namespace: null, timestamp: Date.now() },
      { kind: "delete", path: "/foo", moduleName: "test", namespace: null, timestamp: Date.now() },
      {
        kind: "mount",
        path: "/modules/bar",
        moduleName: "bar",
        namespace: null,
        timestamp: Date.now(),
      },
      {
        kind: "unmount",
        path: "/modules/bar",
        moduleName: "bar",
        namespace: null,
        timestamp: Date.now(),
      },
      {
        kind: "rename",
        path: "/foo",
        moduleName: "bar",
        namespace: null,
        timestamp: Date.now(),
        meta: { newPath: "/baz" },
      },
    ];
    expect(records).toHaveLength(5);
  });

  test("AFSChangeRecord requires moduleName and namespace", async () => {
    const record: AFSChangeRecord = {
      kind: "write",
      path: "/foo",
      moduleName: "test",
      namespace: null,
      timestamp: 1,
    };
    expect(record.moduleName).toBe("test");
    expect(record.namespace).toBeNull();
  });

  test("AFSChangeListener is a function accepting AFSChangeRecord", async () => {
    const listener: AFSChangeListener = (_record: AFSChangeRecord) => {};
    expect(typeof listener).toBe("function");
  });

  test("AFSOptions.onChange is optional", async () => {
    // No onChange — should work fine
    const afs1 = new AFS();
    expect(afs1).toBeDefined();

    // With onChange
    const afs2 = new AFS({ onChange: () => {} });
    expect(afs2).toBeDefined();
  });
});

// ============================================================
// Phase 2: mount/unmount notification tests
// ============================================================

describe("mount/unmount change events", () => {
  test("mount triggers onChange with kind=mount", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({ name: "test-mod", data: {} });
    await afs.mount(mod);

    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("mount");
    expect(records[0]!.path).toBe("/modules/test-mod");
    expect(records[0]!.moduleName).toBe("test-mod");
    expect(records[0]!.timestamp).toBeGreaterThan(0);
  });

  test("unmount triggers onChange with kind=unmount", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({ name: "test-mod", data: {} });
    await afs.mount(mod);
    records.length = 0; // clear mount event

    const result = afs.unmount("/modules/test-mod");
    expect(result).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("unmount");
    expect(records[0]!.moduleName).toBe("test-mod");
  });

  test("no onChange — mount/unmount works normally", async () => {
    const afs = new AFS();
    const mod = new JSONModule({ name: "test-mod", data: {} });
    await afs.mount(mod);
    expect(afs.unmount("/modules/test-mod")).toBe(true);
  });

  test("onChange throwing does not affect mount operation", async () => {
    const afs = new AFS({
      onChange: () => {
        throw new Error("listener boom");
      },
    });
    const mod = new JSONModule({ name: "test-mod", data: {} });
    // Should not throw
    await afs.mount(mod);
    expect(afs.getMounts()).toHaveLength(1);
  });

  test("onChange throwing does not affect unmount operation", async () => {
    const afs = new AFS({
      onChange: (r) => {
        if (r.kind === "unmount") throw new Error("listener boom");
      },
    });
    const mod = new JSONModule({ name: "test-mod", data: {} });
    await afs.mount(mod);
    expect(afs.unmount("/modules/test-mod")).toBe(true);
  });

  // SKIPPED: constructor modules are deprecated - mount() is now async so
  // modules passed to constructor cannot be properly awaited for mount check.
  // Use explicit await afs.mount() instead of passing modules to constructor.
  test.skip("constructor modules trigger mount notifications", async () => {
    const records: AFSChangeRecord[] = [];
    const mod = new JSONModule({ name: "init-mod", data: {} });
    new AFS({ modules: [mod], onChange: (r) => records.push(r) });

    const mountEvents = records.filter((r) => r.kind === "mount");
    expect(mountEvents).toHaveLength(1);
    expect(mountEvents[0]!.moduleName).toBe("init-mod");
  });

  test("unmount returns false (not found) does not trigger onChange", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const result = afs.unmount("/modules/nonexistent");
    expect(result).toBe(false);
    expect(records).toHaveLength(0);
  });

  test("namespace mount includes correct namespace in record", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({ name: "ns-mod", data: {} });
    await afs.mount(mod, "/tools/ns-mod", { namespace: "custom-ns" });

    expect(records).toHaveLength(1);
    expect(records[0]!.namespace).toBe("custom-ns");
  });

  test("mount with replace triggers notification", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod1 = new JSONModule({ name: "mod", data: {} });
    const mod2 = new JSONModule({ name: "mod", data: { replaced: true } });
    await afs.mount(mod1, "/tools/mod");
    await afs.mount(mod2, "/tools/mod", { replace: true });

    const mountEvents = records.filter((r) => r.kind === "mount");
    expect(mountEvents).toHaveLength(2);
  });

  test("record.timestamp is a positive number", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({ name: "ts-mod", data: {} });
    await afs.mount(mod);

    expect(records[0]!.timestamp).toBeGreaterThan(0);
    expect(typeof records[0]!.timestamp).toBe("number");
  });
});

// ============================================================
// Phase 3: write/delete notification tests
// ============================================================

describe("write/delete change events", () => {
  let afs: AFS;
  let records: AFSChangeRecord[];

  beforeEach(async () => {
    records = [];
    const mod = new JSONModule({
      name: "rw-mod",
      data: { existing: { content: "hello" } },
      accessMode: "readwrite",
    });
    afs = new AFS({ onChange: (r) => records.push(r) });
    await afs.mount(mod);
    records.length = 0; // clear mount event
  });

  test("write triggers onChange with kind=write, full mount path, and moduleName", async () => {
    await afs.write("/modules/rw-mod/newFile/content", { content: "new" });

    const writeEvents = records.filter((r) => r.kind === "write");
    expect(writeEvents).toHaveLength(1);
    expect(writeEvents[0]!.path).toContain("/modules/rw-mod/");
    expect(writeEvents[0]!.moduleName).toBe("rw-mod");
  });

  test("delete triggers onChange with kind=delete and moduleName", async () => {
    await afs.delete("/modules/rw-mod/existing", { recursive: true });

    const deleteEvents = records.filter((r) => r.kind === "delete");
    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0]!.kind).toBe("delete");
    expect(deleteEvents[0]!.moduleName).toBe("rw-mod");
  });

  test("write failure (readonly module) does not trigger onChange", async () => {
    const roMod = new JSONModule({ name: "ro-mod", data: {}, accessMode: "readonly" });
    await afs.mount(roMod, "/modules/ro-mod");
    records.length = 0;

    await expect(afs.write("/modules/ro-mod/foo", { content: "x" })).rejects.toThrow();
    expect(records.filter((r) => r.kind === "write")).toHaveLength(0);
  });

  test("delete failure (module without delete) does not trigger onChange", async () => {
    const noDeleteMod = new JSONModule({ name: "no-del", data: {} });
    await afs.mount(noDeleteMod, "/modules/no-del");
    records.length = 0;

    await expect(afs.delete("/modules/no-del/foo")).rejects.toThrow();
    expect(records.filter((r) => r.kind === "delete")).toHaveLength(0);
  });

  test("onChange throwing does not affect write result", async () => {
    const throwAfs = new AFS({
      onChange: (r) => {
        if (r.kind === "write") throw new Error("boom");
      },
    });
    const mod = new JSONModule({ name: "throw-mod", data: {}, accessMode: "readwrite" });
    await throwAfs.mount(mod);

    const result = await throwAfs.write("/modules/throw-mod/foo/content", { content: "bar" });
    expect(result.data).toBeDefined();
  });

  test("multiple writes trigger multiple notifications in order", async () => {
    await afs.write("/modules/rw-mod/file1/content", { content: "a" });
    await afs.write("/modules/rw-mod/file2/content", { content: "b" });

    const writeEvents = records.filter((r) => r.kind === "write");
    expect(writeEvents).toHaveLength(2);
    expect(writeEvents[0]!.timestamp).toBeLessThanOrEqual(writeEvents[1]!.timestamp);
  });

  test("namespace write notification includes correct path", async () => {
    const nsMod = new JSONModule({ name: "ns-rw", data: {}, accessMode: "readwrite" });
    await afs.mount(nsMod, "/tools/ns-rw", { namespace: "myns" });
    records.length = 0;

    await afs.write("$afs:myns/tools/ns-rw/foo/content", { content: "x" });

    const writeEvents = records.filter((r) => r.kind === "write");
    expect(writeEvents).toHaveLength(1);
    expect(writeEvents[0]!.path).toContain("ns-rw");
  });
});

// ============================================================
// Phase 4: rename notification tests
// ============================================================

describe("rename change events", () => {
  let afs: AFS;
  let records: AFSChangeRecord[];

  beforeEach(async () => {
    records = [];
    const mod = new JSONModule({
      name: "rename-mod",
      data: { fileA: "hello", fileB: "world" },
      accessMode: "readwrite",
    });
    afs = new AFS({ onChange: (r) => records.push(r) });
    await afs.mount(mod);
    records.length = 0; // clear mount event
  });

  test("rename triggers onChange with kind=rename and moduleName", async () => {
    await afs.rename("/modules/rename-mod/fileA", "/modules/rename-mod/fileC");

    const renameEvents = records.filter((r) => r.kind === "rename");
    expect(renameEvents).toHaveLength(1);
    expect(renameEvents[0]!.path).toContain("fileA");
    expect(renameEvents[0]!.moduleName).toBe("rename-mod");
    expect(renameEvents[0]!.meta?.newPath).toContain("fileC");
    expect(renameEvents[0]!.timestamp).toBeGreaterThan(0);
  });

  test("rename failure does not trigger onChange", async () => {
    await expect(
      afs.rename("/modules/rename-mod/nonexistent", "/modules/rename-mod/fileC"),
    ).rejects.toThrow();
    expect(records.filter((r) => r.kind === "rename")).toHaveLength(0);
  });

  test("readonly module rename does not trigger onChange", async () => {
    const roAfs = new AFS({ onChange: (r) => records.push(r) });
    const roMod = new JSONModule({
      name: "ro-rename",
      data: { a: "val" },
      accessMode: "readonly",
    });
    await roAfs.mount(roMod);
    records.length = 0;

    await expect(roAfs.rename("/modules/ro-rename/a", "/modules/ro-rename/b")).rejects.toThrow();
    expect(records.filter((r) => r.kind === "rename")).toHaveLength(0);
  });

  test("onChange throwing does not affect rename result", async () => {
    const throwAfs = new AFS({
      onChange: (r) => {
        if (r.kind === "rename") throw new Error("boom");
      },
    });
    const mod = new JSONModule({
      name: "throw-rename",
      data: { a: "val" },
      accessMode: "readwrite",
    });
    await throwAfs.mount(mod);

    const result = await throwAfs.rename("/modules/throw-rename/a", "/modules/throw-rename/b");
    expect(result.message).toBeDefined();
  });
});

// ============================================================
// Phase 5: Security & data integrity tests
// ============================================================

describe("change events security & consistency", () => {
  test("delete event path is normalized (no $afs: prefix leak)", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({
      name: "ns-del",
      data: { target: "value" },
      accessMode: "readwrite",
    });
    await afs.mount(mod, "/tools/ns-del", { namespace: "sec-ns" });
    records.length = 0;

    await afs.delete("$afs:sec-ns/tools/ns-del/target");

    const deleteEvents = records.filter((r) => r.kind === "delete");
    expect(deleteEvents).toHaveLength(1);
    // Path must NOT contain $afs: prefix — consumers expect normalized paths
    expect(deleteEvents[0]!.path).not.toContain("$afs:");
    expect(deleteEvents[0]!.path).toContain("ns-del");
  });

  test("rename event path is normalized (no $afs: prefix leak)", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({
      name: "ns-ren",
      data: { a: "val" },
      accessMode: "readwrite",
    });
    await afs.mount(mod, "/tools/ns-ren", { namespace: "sec-ns" });
    records.length = 0;

    await afs.rename("$afs:sec-ns/tools/ns-ren/a", "$afs:sec-ns/tools/ns-ren/b");

    const renameEvents = records.filter((r) => r.kind === "rename");
    expect(renameEvents).toHaveLength(1);
    expect(renameEvents[0]!.path).not.toContain("$afs:");
    expect(renameEvents[0]!.meta?.newPath as string).not.toContain("$afs:");
  });

  test("mount conflict does not trigger onChange", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod1 = new JSONModule({ name: "conflict", data: {} });
    const mod2 = new JSONModule({ name: "conflict", data: {} });
    await afs.mount(mod1, "/tools/conflict");
    records.length = 0;

    await expect(afs.mount(mod2, "/tools/conflict")).rejects.toThrow();
    expect(records).toHaveLength(0);
  });

  test("listener mutating record does not affect AFS state", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({
      onChange: (r) => {
        records.push({ ...r }); // save a copy
        // Malicious mutation attempt
        (r as any).kind = "HACKED";
        (r as any).path = "/etc/passwd";
      },
    });

    const mod = new JSONModule({
      name: "mut-mod",
      data: {},
      accessMode: "readwrite",
    });
    await afs.mount(mod);

    // Write should succeed and return correct data regardless of listener mutation
    const result = await afs.write("/modules/mut-mod/safe/content", { content: "data" });
    expect(result.data.path).toContain("/modules/mut-mod/");
    expect(result.data.path).not.toContain("/etc/passwd");

    // Second event should still have correct kind (not "HACKED")
    const writeEvents = records.filter((r) => r.kind === "write");
    expect(writeEvents).toHaveLength(1);
  });

  test("namespace delete event includes moduleName", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({
      name: "ns-del-mod",
      data: { item: "val" },
      accessMode: "readwrite",
    });
    await afs.mount(mod, "/tools/ns-del-mod", { namespace: "del-ns" });
    records.length = 0;

    await afs.delete("$afs:del-ns/tools/ns-del-mod/item");

    const deleteEvents = records.filter((r) => r.kind === "delete");
    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0]!.moduleName).toBe("ns-del-mod");
  });

  test("namespace rename event includes namespace field", async () => {
    const records: AFSChangeRecord[] = [];
    const afs = new AFS({ onChange: (r) => records.push(r) });

    const mod = new JSONModule({
      name: "ns-ren-mod",
      data: { x: "val" },
      accessMode: "readwrite",
    });
    await afs.mount(mod, "/tools/ns-ren-mod", { namespace: "ren-ns" });
    records.length = 0;

    await afs.rename("$afs:ren-ns/tools/ns-ren-mod/x", "$afs:ren-ns/tools/ns-ren-mod/y");

    const renameEvents = records.filter((r) => r.kind === "rename");
    expect(renameEvents).toHaveLength(1);
    expect(renameEvents[0]!.namespace).toBe("ren-ns");
    expect(renameEvents[0]!.moduleName).toBe("ns-ren-mod");
  });
});
