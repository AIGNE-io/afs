/**
 * Tests for onChange → Event bridge (Phase 1)
 *
 * Every notifyChange() call (write, delete, mount, unmount, rename)
 * should also dispatch an AFSEvent to the EventBus so that
 * subscribe() consumers receive the same notifications.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import type { AFSEvent } from "../src/events.js";
import type { AFSChangeRecord } from "../src/type.js";
import { JSONModule } from "./mocks/json-module.js";

// ─── Helpers ────────────────────────────────────────────────────

function createRWModule(name: string, data: Record<string, unknown> = {}) {
  return new JSONModule({ name, data, accessMode: "readwrite" });
}

// ─── Tests ──────────────────────────────────────────────────────

describe("onChange → Event bridge", () => {
  let afs: AFS;
  let changeRecords: AFSChangeRecord[];
  let events: AFSEvent[];

  beforeEach(async () => {
    changeRecords = [];
    events = [];
    afs = new AFS({ onChange: (r) => changeRecords.push(r) });
    afs.subscribe({}, (e) => events.push(e));

    const mod = createRWModule("bridge-mod", { existing: { content: "hello" } });
    await afs.mount(mod);
    // Clear mount events from setup
    changeRecords.length = 0;
    events.length = 0;
  });

  describe("write bridge", () => {
    test("write() triggers both onChange and subscribe({ type: 'afs:write' })", async () => {
      await afs.write("/modules/bridge-mod/newFile/content", { content: "new" });

      const writeChanges = changeRecords.filter((r) => r.kind === "write");
      const writeEvents = events.filter((e) => e.type === "afs:write");

      expect(writeChanges).toHaveLength(1);
      expect(writeEvents).toHaveLength(1);
    });

    test("bridge event path matches AFSChangeRecord.path", async () => {
      await afs.write("/modules/bridge-mod/newFile/content", { content: "new" });

      const change = changeRecords.find((r) => r.kind === "write")!;
      const event = events.find((e) => e.type === "afs:write")!;

      expect(event.path).toBe(change.path);
    });

    test("bridge event source comes from AFSChangeRecord.moduleName", async () => {
      await afs.write("/modules/bridge-mod/newFile/content", { content: "new" });

      const event = events.find((e) => e.type === "afs:write")!;
      expect(event.source).toBe("bridge-mod");
    });

    test("bridge event timestamp comes from AFSChangeRecord.timestamp", async () => {
      await afs.write("/modules/bridge-mod/newFile/content", { content: "new" });

      const change = changeRecords.find((r) => r.kind === "write")!;
      const event = events.find((e) => e.type === "afs:write")!;

      expect(event.timestamp).toBe(change.timestamp);
    });
  });

  describe("delete bridge", () => {
    test("delete() triggers both onChange and subscribe({ type: 'afs:delete' })", async () => {
      await afs.delete("/modules/bridge-mod/existing", { recursive: true });

      const deleteChanges = changeRecords.filter((r) => r.kind === "delete");
      const deleteEvents = events.filter((e) => e.type === "afs:delete");

      expect(deleteChanges).toHaveLength(1);
      expect(deleteEvents).toHaveLength(1);
    });
  });

  describe("mount bridge", () => {
    test("mount() triggers both onChange and subscribe({ type: 'afs:mount' })", async () => {
      // Clear events from beforeEach mount
      changeRecords.length = 0;
      events.length = 0;

      const mod2 = createRWModule("bridge-mod2");
      await afs.mount(mod2);

      const mountChanges = changeRecords.filter((r) => r.kind === "mount");
      const mountEvents = events.filter((e) => e.type === "afs:mount");

      expect(mountChanges).toHaveLength(1);
      expect(mountEvents).toHaveLength(1);
    });

    test("mount bridge event includes moduleName as source", async () => {
      changeRecords.length = 0;
      events.length = 0;

      const mod2 = createRWModule("mount-test-mod");
      await afs.mount(mod2);

      const event = events.find((e) => e.type === "afs:mount")!;
      expect(event.source).toBe("mount-test-mod");
    });
  });

  describe("unmount bridge", () => {
    test("unmount() triggers both onChange and subscribe({ type: 'afs:unmount' })", async () => {
      changeRecords.length = 0;
      events.length = 0;

      afs.unmount("/modules/bridge-mod");

      const unmountChanges = changeRecords.filter((r) => r.kind === "unmount");
      const unmountEvents = events.filter((e) => e.type === "afs:unmount");

      expect(unmountChanges).toHaveLength(1);
      expect(unmountEvents).toHaveLength(1);
    });
  });

  describe("rename bridge", () => {
    test("rename() triggers both onChange and subscribe({ type: 'afs:rename' })", async () => {
      const mod = createRWModule("rename-bridge", { fileA: "hello", fileB: "world" });
      await afs.mount(mod);
      changeRecords.length = 0;
      events.length = 0;

      await afs.rename("/modules/rename-bridge/fileA", "/modules/rename-bridge/fileC");

      const renameChanges = changeRecords.filter((r) => r.kind === "rename");
      const renameEvents = events.filter((e) => e.type === "afs:rename");

      expect(renameChanges).toHaveLength(1);
      expect(renameEvents).toHaveLength(1);
    });

    test("rename bridge event data includes meta (newPath)", async () => {
      const mod = createRWModule("rename-meta", { x: "val" });
      await afs.mount(mod);
      changeRecords.length = 0;
      events.length = 0;

      await afs.rename("/modules/rename-meta/x", "/modules/rename-meta/y");

      const event = events.find((e) => e.type === "afs:rename")!;
      expect(event.data).toBeDefined();
      expect((event.data as Record<string, unknown>).newPath).toContain("y");
    });
  });

  describe("bridge data consistency", () => {
    test("bridge event data comes from AFSChangeRecord.meta", async () => {
      const mod = createRWModule("meta-bridge", { a: "val" });
      await afs.mount(mod);
      changeRecords.length = 0;
      events.length = 0;

      await afs.rename("/modules/meta-bridge/a", "/modules/meta-bridge/b");

      const change = changeRecords.find((r) => r.kind === "rename")!;
      const event = events.find((e) => e.type === "afs:rename")!;

      expect(event.data).toEqual(change.meta);
    });

    test("write event data is undefined (write has no meta)", async () => {
      await afs.write("/modules/bridge-mod/x/content", { content: "v" });

      const event = events.find((e) => e.type === "afs:write")!;
      expect(event.data).toBeUndefined();
    });
  });

  describe("backward compatibility", () => {
    test("subscribe-only (no onChange) receives bridge events", async () => {
      const subOnly = new AFS(); // no onChange
      const subEvents: AFSEvent[] = [];
      subOnly.subscribe({ type: "afs:mount" }, (e) => subEvents.push(e));

      const mod = createRWModule("sub-only-mod");
      await subOnly.mount(mod);

      expect(subEvents).toHaveLength(1);
      expect(subEvents[0]!.type).toBe("afs:mount");
    });

    test("onChange-only (no subscribe) still works", async () => {
      const records: AFSChangeRecord[] = [];
      const onChangeOnly = new AFS({ onChange: (r) => records.push(r) });

      const mod = createRWModule("onchange-only-mod");
      await onChangeOnly.mount(mod);

      expect(records).toHaveLength(1);
      expect(records[0]!.kind).toBe("mount");
    });

    test("subscribe callback throwing does not affect onChange callback", async () => {
      const records: AFSChangeRecord[] = [];
      const afs2 = new AFS({ onChange: (r) => records.push(r) });
      afs2.subscribe({}, () => {
        throw new Error("subscriber crash");
      });

      const mod = createRWModule("crash-test-mod");
      await afs2.mount(mod);

      // onChange still received the record despite subscribe crashing
      expect(records).toHaveLength(1);
      expect(records[0]!.kind).toBe("mount");
    });
  });

  describe("wildcard matching", () => {
    test("subscribe({ type: 'afs:*' }) matches all bridge events", async () => {
      const wildcardEvents: AFSEvent[] = [];
      afs.subscribe({ type: "afs:*" }, (e) => wildcardEvents.push(e));

      // Clear setup events
      wildcardEvents.length = 0;

      await afs.write("/modules/bridge-mod/file1/content", { content: "a" });
      await afs.delete("/modules/bridge-mod/existing", { recursive: true });

      expect(wildcardEvents).toHaveLength(2);
      expect(wildcardEvents[0]!.type).toBe("afs:write");
      expect(wildcardEvents[1]!.type).toBe("afs:delete");
    });
  });
});
