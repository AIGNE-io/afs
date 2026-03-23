/**
 * Tests for .meta.events declaration spec (Phase 2)
 *
 * Providers can declare which event types they emit via the
 * `events` field in their `.meta` response. This is optional —
 * not declaring events does not affect emit/subscribe.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import type { AFSEventDeclaration } from "../src/events.js";
import { AFSBaseProvider } from "../src/provider/base.js";
import { List, Meta, Read } from "../src/provider/decorators.js";
import type { RouteContext } from "../src/provider/types.js";

// ─── Test Providers ─────────────────────────────────────────────

/** Provider that declares events in .meta */
class EventDeclaringProvider extends AFSBaseProvider {
  readonly name = "declarer";
  readonly description = "Provider that declares events";

  @List("/")
  async listRoot(_ctx: RouteContext) {
    return { data: [{ id: "item", path: "/item" }] };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext) {
    return { id: "root", path: "/", meta: { childrenCount: 1 } };
  }

  @Meta("/")
  async metaRoot(_ctx: RouteContext) {
    return {
      id: "root-meta",
      path: "/.meta",
      meta: {
        kind: "test:root",
        events: [
          { type: "declarer:update", description: "Item was updated" },
          {
            type: "declarer:delete",
            description: "Item was deleted",
            dataSchema: { type: "object", properties: { id: { type: "string" } } },
          },
          { type: "declarer:status" },
        ] satisfies AFSEventDeclaration[],
      },
    };
  }
}

/** Provider that does NOT declare events */
class NoEventsProvider extends AFSBaseProvider {
  readonly name = "silent";
  readonly description = "Provider that does not declare events";

  @List("/")
  async listRoot(_ctx: RouteContext) {
    return { data: [] };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext) {
    return { id: "root", path: "/", meta: { childrenCount: 0 } };
  }

  @Meta("/")
  async metaRoot(_ctx: RouteContext) {
    return { id: "root-meta", path: "/.meta", meta: { kind: "test:silent" } };
  }
}

/** Provider with empty events array (explicitly "no events") */
class EmptyEventsProvider extends AFSBaseProvider {
  readonly name = "empty-events";
  readonly description = "Provider with empty events";

  @List("/")
  async listRoot(_ctx: RouteContext) {
    return { data: [] };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext) {
    return { id: "root", path: "/", meta: { childrenCount: 0 } };
  }

  @Meta("/")
  async metaRoot(_ctx: RouteContext) {
    return {
      id: "root-meta",
      path: "/.meta",
      meta: { kind: "test:empty", events: [] as AFSEventDeclaration[] },
    };
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe("AFSEventDeclaration type", () => {
  test("AFSEventDeclaration contains type as required string", () => {
    const decl: AFSEventDeclaration = { type: "test:event" };
    expect(decl.type).toBe("test:event");
  });

  test("AFSEventDeclaration has optional description", () => {
    const decl: AFSEventDeclaration = { type: "test:event", description: "A test event" };
    expect(decl.description).toBe("A test event");
  });

  test("AFSEventDeclaration has optional dataSchema", () => {
    const decl: AFSEventDeclaration = {
      type: "test:event",
      dataSchema: { type: "object", properties: { id: { type: "string" } } },
    };
    expect(decl.dataSchema).toBeDefined();
    expect(decl.dataSchema!.type).toBe("object");
  });
});

describe(".meta events declaration", () => {
  let afs: AFS;

  beforeEach(async () => {
    afs = new AFS();
  });

  test("provider .meta returns events field with declarations", async () => {
    await afs.mount(new EventDeclaringProvider(), "/test");

    const result = await afs.read("/test/.meta");
    const meta = result.data?.meta;

    expect(meta?.events).toBeDefined();
    expect(Array.isArray(meta?.events)).toBe(true);
    expect(meta?.events).toHaveLength(3);
  });

  test("each event declaration has type as non-empty string", async () => {
    await afs.mount(new EventDeclaringProvider(), "/test");

    const result = await afs.read("/test/.meta");
    const events = result.data?.meta?.events as AFSEventDeclaration[];

    for (const evt of events) {
      expect(typeof evt.type).toBe("string");
      expect(evt.type.length).toBeGreaterThan(0);
    }
  });

  test("event declaration description is optional string", async () => {
    await afs.mount(new EventDeclaringProvider(), "/test");

    const result = await afs.read("/test/.meta");
    const events = result.data?.meta?.events as AFSEventDeclaration[];

    // First two have description, third does not
    expect(events[0]!.description).toBe("Item was updated");
    expect(events[1]!.description).toBe("Item was deleted");
    expect(events[2]!.description).toBeUndefined();
  });

  test("event declaration dataSchema is optional", async () => {
    await afs.mount(new EventDeclaringProvider(), "/test");

    const result = await afs.read("/test/.meta");
    const events = result.data?.meta?.events as AFSEventDeclaration[];

    expect(events[0]!.dataSchema).toBeUndefined();
    expect(events[1]!.dataSchema).toBeDefined();
  });

  test("provider without events has no events field in .meta", async () => {
    await afs.mount(new NoEventsProvider(), "/silent");

    const result = await afs.read("/silent/.meta");
    const meta = result.data?.meta;

    expect(meta?.events).toBeUndefined();
  });

  test("empty events array means explicitly no events (different from undefined)", async () => {
    await afs.mount(new EmptyEventsProvider(), "/empty");

    const result = await afs.read("/empty/.meta");
    const meta = result.data?.meta;

    // Explicitly set to empty array
    expect(meta?.events).toBeDefined();
    expect(meta?.events).toEqual([]);
  });

  test("events declaration does not affect emit capability", async () => {
    // Provider with no declared events can still emit
    const provider = new NoEventsProvider();
    await afs.mount(provider, "/silent");

    // The provider extends AFSBaseProvider and could call emit()
    // (tested via EventEmittingProvider in events.test.ts)
    // This test just confirms mounting and meta work independently
    const result = await afs.read("/silent/.meta");
    expect(result.data?.meta?.events).toBeUndefined();
  });
});
