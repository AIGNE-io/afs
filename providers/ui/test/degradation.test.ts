import { describe, expect, it } from "bun:test";
import type { AUPNode } from "../src/aup-types.js";
import { DEVICE_CAPS_WEB_FULL, type DeviceCaps, fillPrimitives } from "../src/aup-types.js";
import { DEGRADATION_CHAINS, degradeTree } from "../src/degradation.js";

// ── Helper: device that only supports text ──
const TEXT_ONLY_CAPS: DeviceCaps = {
  platform: "cli",
  formFactor: "terminal",
  primitives: fillPrimitives({ text: "native" }, "unsupported"),
};

// ── Helper: device that supports text + table ──
const TEXT_TABLE_CAPS: DeviceCaps = {
  platform: "cli",
  formFactor: "terminal",
  primitives: fillPrimitives({ text: "native", table: "native" }, "unsupported"),
};

// ── Degradation Chain Registry ──

describe("DEGRADATION_CHAINS", () => {
  it("defines chains for known complex primitives", () => {
    expect(DEGRADATION_CHAINS.chart).toBeDefined();
    expect(DEGRADATION_CHAINS.map).toBeDefined();
    expect(DEGRADATION_CHAINS.calendar).toBeDefined();
    // terminal is now a component, not a primitive — no degradation chain
    expect(DEGRADATION_CHAINS.terminal).toBeUndefined();
    expect(DEGRADATION_CHAINS.overlay).toBeDefined();
  });

  it("all chains eventually reach text or unsupported", () => {
    for (const [_primitive, chain] of Object.entries(DEGRADATION_CHAINS)) {
      const last = chain[chain.length - 1];
      expect(last === "text" || last === "unsupported").toBe(true);
    }
  });
});

// ── degradeTree() ──

describe("degradeTree", () => {
  // Happy Path

  it("returns tree unchanged when all primitives supported", () => {
    const tree: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "t1", type: "text", props: { content: "hello" } },
        { id: "a1", type: "action", props: { label: "Click" } },
      ],
    };
    const result = degradeTree(tree, DEVICE_CAPS_WEB_FULL);
    expect(result.id).toBe("root");
    expect(result.type).toBe("view");
    expect(result.children?.length).toBe(2);
    // No _degradedFrom annotation
    expect((result as any).props?._degradedFrom).toBeUndefined();
  });

  it("degrades chart → table when chart unsupported but table supported", () => {
    const tree: AUPNode = {
      id: "c1",
      type: "chart",
      props: {
        chartType: "bar",
        data: [
          { label: "A", value: 10 },
          { label: "B", value: 20 },
        ],
      },
    };
    const result = degradeTree(tree, TEXT_TABLE_CAPS);
    expect(result.type).toBe("table");
    expect(result.props?._degradedFrom).toBe("chart");
  });

  it("degrades chart → text when both chart and table unsupported", () => {
    const tree: AUPNode = {
      id: "c1",
      type: "chart",
      props: {
        chartType: "bar",
        data: [
          { label: "A", value: 10 },
          { label: "B", value: 20 },
        ],
      },
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.type).toBe("text");
    expect(result.props?._degradedFrom).toBe("chart");
  });

  it("passes through terminal (component, no degradation chain)", () => {
    const tree: AUPNode = {
      id: "term1",
      type: "terminal",
      props: { endpoint: "/ws/terminal" },
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    // terminal has no degradation chain — passes through unchanged
    expect(result.type).toBe("terminal");
    expect(result.props?._degradedFrom).toBeUndefined();
  });

  it("degrades overlay → text for text-only device", () => {
    const tree: AUPNode = {
      id: "ov1",
      type: "overlay",
      props: { content: "Notification!", intent: "info" },
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.type).toBe("text");
    expect(result.props?._degradedFrom).toBe("overlay");
  });

  it("degrades calendar → table → text through chain", () => {
    // Calendar → table → text
    const tree: AUPNode = {
      id: "cal1",
      type: "calendar",
      props: { events: [{ date: "2026-01-01", title: "New Year" }] },
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.type).toBe("text");
    expect(result.props?._degradedFrom).toBe("calendar");
  });

  it("degrades calendar → table when table supported", () => {
    const tree: AUPNode = {
      id: "cal1",
      type: "calendar",
      props: { events: [{ date: "2026-01-01", title: "New Year" }] },
    };
    const result = degradeTree(tree, TEXT_TABLE_CAPS);
    expect(result.type).toBe("table");
    expect(result.props?._degradedFrom).toBe("calendar");
  });

  // Recursive degradation

  it("degrades children recursively", () => {
    const tree: AUPNode = {
      id: "root",
      type: "view",
      children: [
        { id: "t1", type: "text", props: { content: "hello" } },
        {
          id: "c1",
          type: "chart",
          props: { chartType: "bar", data: [] },
        },
        {
          id: "nested",
          type: "view",
          children: [{ id: "term1", type: "terminal", props: { endpoint: "/ws/terminal" } }],
        },
      ],
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    // Root view is supported (view → text-only? view should be supported)
    // Actually view is a structural primitive, let's check
    expect(result.type).toBe("view");
    // Chart degraded
    expect(result.children![1]!.type).toBe("text");
    expect(result.children![1]!.props?._degradedFrom).toBe("chart");
    // Nested terminal passes through (component, no degradation chain)
    expect(result.children![2]!.children![0]!.type).toBe("terminal");
    expect(result.children![2]!.children![0]!.props?._degradedFrom).toBeUndefined();
  });

  // Edge cases

  it("preserves node ID through degradation", () => {
    const tree: AUPNode = { id: "myid", type: "chart", props: { data: [] } };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.id).toBe("myid");
  });

  it("preserves events through degradation", () => {
    const tree: AUPNode = {
      id: "c1",
      type: "chart",
      props: { data: [] },
      events: { click: { exec: "/some/action" } },
    };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.events?.click).toBeDefined();
  });

  it("handles tree with no children", () => {
    const tree: AUPNode = { id: "t1", type: "text", props: { content: "hi" } };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.type).toBe("text");
    expect(result.children).toBeUndefined();
  });

  it("handles empty children array", () => {
    const tree: AUPNode = { id: "v1", type: "view", children: [] };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    expect(result.children).toEqual([]);
  });

  it("does not mutate the original tree", () => {
    const tree: AUPNode = {
      id: "c1",
      type: "chart",
      props: { data: [1, 2, 3] },
    };
    const original = JSON.parse(JSON.stringify(tree));
    degradeTree(tree, TEXT_ONLY_CAPS);
    expect(tree).toEqual(original);
  });

  // rtc → unsupported

  it("marks rtc as unsupported (no meaningful fallback)", () => {
    const tree: AUPNode = { id: "r1", type: "rtc", props: {} };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    // rtc chain is ["unsupported"], so final type should indicate unsupported
    expect(result.props?._degradedFrom).toBe("rtc");
    expect(result.props?._unsupported).toBe(true);
  });

  // "partial" capability — treated as supported (device can render it partially)

  it("treats 'partial' capability as supported (no degradation)", () => {
    const partialCaps: DeviceCaps = {
      platform: "mobile",
      formFactor: "phone",
      primitives: fillPrimitives({ text: "native", chart: "partial" }, "unsupported"),
    };
    const tree: AUPNode = { id: "c1", type: "chart", props: { data: [] } };
    const result = degradeTree(tree, partialCaps);
    expect(result.type).toBe("chart"); // not degraded
    expect(result.props?._degradedFrom).toBeUndefined();
  });

  // "webview" capability — treated as supported

  it("treats 'webview' capability as supported (no degradation)", () => {
    const tree: AUPNode = { id: "c1", type: "chart", props: { data: [] } };
    const result = degradeTree(tree, DEVICE_CAPS_WEB_FULL);
    expect(result.type).toBe("chart");
  });

  // Unknown primitive type (not in chain registry) — pass through

  it("passes through unknown primitive types unchanged", () => {
    const tree: AUPNode = { id: "x1", type: "custom-widget", props: { foo: 1 } };
    const result = degradeTree(tree, TEXT_ONLY_CAPS);
    // Unknown type has no degradation chain — pass through as-is
    expect(result.type).toBe("custom-widget");
  });
});
