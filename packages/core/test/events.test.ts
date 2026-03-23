/**
 * Tests for AFS Event System (Phase 0)
 *
 * EventBus: in-process pub/sub
 * AFS.subscribe(filter, callback): consumer-side
 * AFSBaseProvider.emit(event): provider-side via onMount-injected event sink
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import type { AFSEvent, AFSEventCallback } from "../src/events.js";
import { AFSBaseProvider } from "../src/provider/base.js";
import { List, Meta, Read } from "../src/provider/decorators.js";
import type { RouteContext } from "../src/provider/types.js";

// ─── Test Provider that emits events ───────────────────────────────

class EventEmittingProvider extends AFSBaseProvider {
  readonly name = "emitter";
  readonly description = "Test provider that emits events";

  @List("/")
  async listRoot(_ctx: RouteContext) {
    return { data: [{ id: "item", path: "/item" }] };
  }

  @Read("/")
  async readRoot(_ctx: RouteContext) {
    return { id: "root", path: "/", meta: { childrenCount: 1 } };
  }

  @Read("/:id")
  async readItem(ctx: RouteContext<{ id: string }>) {
    return { id: ctx.params.id, path: ctx.path, content: "data" };
  }

  @Meta("/")
  async metaRoot(_ctx: RouteContext) {
    return { kind: "test:root" };
  }

  // Public method to test emit
  async triggerEvent(type: string, path: string, data?: Record<string, unknown>) {
    this.emit({ type, path, data });
  }
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("AFS Event System", () => {
  let afs: AFS;
  let provider: EventEmittingProvider;

  beforeEach(async () => {
    afs = new AFS();
    provider = new EventEmittingProvider();
    await afs.mount(provider, "/test");
  });

  describe("subscribe + emit basics", () => {
    test("subscribe with exact type filter receives matching events", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ type: "test:update" }, (event) => received.push(event));

      await provider.triggerEvent("test:update", "/item", { value: 1 });

      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe("test:update");
      expect(received[0]!.data).toEqual({ value: 1 });
    });

    test("subscribe with wildcard type filter matches prefix", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ type: "test:*" }, (event) => received.push(event));

      await provider.triggerEvent("test:update", "/item");
      await provider.triggerEvent("test:delete", "/item");
      await provider.triggerEvent("other:event", "/item");

      expect(received).toHaveLength(2);
      expect(received[0]!.type).toBe("test:update");
      expect(received[1]!.type).toBe("test:delete");
    });

    test("subscribe with path filter matches path prefix", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/test" }, (event) => received.push(event));

      await provider.triggerEvent("evt", "/item"); // becomes /test/item
      await provider.triggerEvent("evt", "/other");

      expect(received).toHaveLength(2); // all paths from /test provider match
    });

    test("subscribe with source filter matches provider name", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ source: "emitter" }, (event) => received.push(event));

      await provider.triggerEvent("evt", "/item");

      expect(received).toHaveLength(1);
      expect(received[0]!.source).toBe("emitter");
    });

    test("empty filter matches all events", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (event) => received.push(event));

      await provider.triggerEvent("a", "/x");
      await provider.triggerEvent("b", "/y");

      expect(received).toHaveLength(2);
    });

    test("multiple filters are AND-combined", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ type: "test:update", source: "emitter" }, (event) => received.push(event));

      await provider.triggerEvent("test:update", "/item");
      await provider.triggerEvent("test:delete", "/item");

      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe("test:update");
    });

    test("multiple subscribers receive the same event", async () => {
      const received1: AFSEvent[] = [];
      const received2: AFSEvent[] = [];
      afs.subscribe({}, (e) => received1.push(e));
      afs.subscribe({}, (e) => received2.push(e));

      await provider.triggerEvent("evt", "/item");

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe("unsubscribe", () => {
    test("unsubscribe stops receiving events", async () => {
      const received: AFSEvent[] = [];
      const unsub = afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/a");
      unsub();
      await provider.triggerEvent("evt", "/b");

      expect(received).toHaveLength(1);
    });

    test("double unsubscribe is safe (idempotent)", async () => {
      const unsub = afs.subscribe({}, () => {});
      unsub();
      expect(() => unsub()).not.toThrow();
    });
  });

  describe("emit auto-fills fields", () => {
    test("emit auto-fills source from provider name", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/item");

      expect(received[0]!.source).toBe("emitter");
    });

    test("emit auto-fills timestamp", async () => {
      const before = Date.now();
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/item");
      const after = Date.now();

      expect(received[0]!.timestamp).toBeGreaterThanOrEqual(before);
      expect(received[0]!.timestamp).toBeLessThanOrEqual(after);
    });

    test("emit adds mount prefix to path", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/item"); // provider-internal path

      expect(received[0]!.path).toBe("/test/item"); // AFS absolute path
    });
  });

  describe("error resilience", () => {
    test("subscriber exception does not affect emit caller", async () => {
      afs.subscribe({}, () => {
        throw new Error("subscriber crash");
      });

      // Should not throw
      expect(() => provider.triggerEvent("evt", "/item")).not.toThrow();
    });

    test("subscriber exception does not affect other subscribers", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, () => {
        throw new Error("first crash");
      });
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/item");

      expect(received).toHaveLength(1);
    });

    test("provider emit before mount is silent (no throw)", () => {
      const unmounted = new EventEmittingProvider();
      expect(() => unmounted.triggerEvent("evt", "/x")).not.toThrow();
    });
  });

  describe("filter edge cases", () => {
    test("path filter '/' matches all paths", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/" }, (e) => received.push(e));

      await provider.triggerEvent("evt", "/a");
      await provider.triggerEvent("evt", "/b/c");

      expect(received).toHaveLength(2);
    });

    test("path filter '/a' does not match '/ab' (boundary match)", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/test/a" }, (e) => received.push(e));

      // /test/ab should not match /test/a prefix at path boundary
      await provider.triggerEvent("evt", "/ab");

      expect(received).toHaveLength(0);
    });

    test("type glob 'x:*' does not match 'xy:z'", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ type: "x:*" }, (e) => received.push(e));

      await provider.triggerEvent("xy:z", "/item");

      expect(received).toHaveLength(0);
    });

    test("path filter with * wildcard matches any single segment", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/test/conversations/*/messages" }, (e) => received.push(e));

      // /conversations/123/messages → mount-prefixed to /test/conversations/123/messages
      await provider.triggerEvent("evt", "/conversations/123/messages");
      // child path should also match (prefix semantics)
      await provider.triggerEvent("evt", "/conversations/456/messages/789");
      // wrong structure should not match
      await provider.triggerEvent("evt", "/conversations/123/other");

      expect(received).toHaveLength(2);
      expect(received[0]!.path).toBe("/test/conversations/123/messages");
      expect(received[1]!.path).toBe("/test/conversations/456/messages/789");
    });

    test("path filter with multiple * wildcards", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/test/*/conversations/*/messages" }, (e) => received.push(e));

      await provider.triggerEvent("evt", "/botA/conversations/ch1/messages");
      await provider.triggerEvent("evt", "/botB/conversations/ch2/messages/99");
      await provider.triggerEvent("evt", "/botA/conversations/ch1/other");

      expect(received).toHaveLength(2);
    });

    test("path filter * does not match empty segment or multiple segments", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ path: "/test/a/*/c" }, (e) => received.push(e));

      // * must match exactly one segment
      await provider.triggerEvent("evt", "/a/c"); // missing segment — no match
      await provider.triggerEvent("evt", "/a/x/y/c"); // two segments — no match
      await provider.triggerEvent("evt", "/a/b/c"); // one segment — match

      expect(received).toHaveLength(1);
      expect(received[0]!.path).toBe("/test/a/b/c");
    });

    test("empty string filter.type treated as no filter", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({ type: "" }, (e) => received.push(e));

      await provider.triggerEvent("any:type", "/item");

      expect(received).toHaveLength(1);
    });

    test("same callback registered twice receives event twice", async () => {
      let count = 0;
      const cb: AFSEventCallback = () => count++;
      afs.subscribe({}, cb);
      afs.subscribe({}, cb);

      await provider.triggerEvent("evt", "/item");

      expect(count).toBe(2);
    });
  });

  describe("AFSEvent type structure", () => {
    test("AFSEvent contains type, path, source, timestamp required fields", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("test:evt", "/item", { key: "val" });

      const evt = received[0]!;
      expect(typeof evt.type).toBe("string");
      expect(typeof evt.path).toBe("string");
      expect(typeof evt.source).toBe("string");
      expect(typeof evt.timestamp).toBe("number");
      expect(evt.data).toEqual({ key: "val" });
    });

    test("AFSEvent data is optional", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("test:evt", "/item");

      expect(received[0]!.data).toBeUndefined();
    });
  });

  describe("unmount cleanup", () => {
    test("events from unmounted provider are not dispatched", async () => {
      const received: AFSEvent[] = [];
      afs.subscribe({}, (e) => received.push(e));

      await provider.triggerEvent("evt", "/before");
      afs.unmount("/test");
      await provider.triggerEvent("evt", "/after");

      // 2 events: provider "evt" + bridge "afs:unmount". No "/after" event.
      const providerEvents = received.filter((e) => e.type === "evt");
      expect(providerEvents).toHaveLength(1);
      expect(providerEvents[0]!.path).toBe("/test/before");

      // The bridge unmount event is also present
      expect(received.find((e) => e.type === "afs:unmount")).toBeDefined();
    });
  });
});
