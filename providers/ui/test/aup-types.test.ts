/**
 * AUP Types — validation tests.
 */
import { describe, expect, test } from "bun:test";
import {
  AUP_PRIMITIVES,
  DEVICE_CAPS_TERM,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_CHAT,
  DEVICE_CAPS_WEB_FULL,
  type DeviceCaps,
  fillPrimitives,
  validateDeviceCaps,
  validateNode,
  validatePatchOp,
} from "../src/aup-types.js";

describe("AUP Node Validation", () => {
  // ── Happy Path ──

  test("valid minimal node passes", () => {
    expect(validateNode({ id: "root", type: "view" })).toBeNull();
  });

  test("valid node tree passes (view → text + action children)", () => {
    expect(
      validateNode({
        id: "root",
        type: "view",
        children: [
          { id: "t1", type: "text", props: { content: "Hello" } },
          {
            id: "a1",
            type: "action",
            props: { label: "Click" },
            events: { click: { exec: "/test/.actions/do", args: { x: 1 } } },
          },
        ],
      }),
    ).toBeNull();
  });

  test("node with all optional fields passes", () => {
    expect(
      validateNode({
        id: "n",
        type: "view",
        props: { mode: "card" },
        state: { expanded: true },
        events: { click: { exec: "/a" } },
        children: [],
      }),
    ).toBeNull();
  });

  // ── Bad Path ──

  test("null node returns error", () => {
    expect(validateNode(null)).toBe("node must be an object");
  });

  test("non-object node returns error", () => {
    expect(validateNode("string")).toBe("node must be an object");
  });

  test("missing id returns error", () => {
    expect(validateNode({ type: "view" })).toBe("node.id is required and must be a string");
  });

  test("non-string id returns error", () => {
    expect(validateNode({ id: 123, type: "view" })).toBe(
      "node.id is required and must be a string",
    );
  });

  test("missing type returns error", () => {
    expect(validateNode({ id: "n" })).toBe("node.type is required and must be a string");
  });

  test("invalid child node propagates error", () => {
    expect(
      validateNode({
        id: "root",
        type: "view",
        children: [{ id: "bad" }], // missing type
      }),
    ).toBe("node.type is required and must be a string");
  });

  // ── Security ──

  test("event exec with javascript: protocol is rejected", () => {
    expect(
      validateNode({
        id: "n",
        type: "action",
        events: { click: { exec: "javascript:alert(1)" } },
      }),
    ).toBe("event exec path cannot use javascript: protocol");
  });

  test("event exec with JAVASCRIPT: (uppercase) is rejected", () => {
    expect(
      validateNode({
        id: "n",
        type: "action",
        events: { click: { exec: "JAVASCRIPT:void(0)" } },
      }),
    ).toBe("event exec path cannot use javascript: protocol");
  });

  // ── Edge Cases ──

  test("empty children array passes", () => {
    expect(validateNode({ id: "n", type: "view", children: [] })).toBeNull();
  });

  test("deeply nested tree (5 levels) passes", () => {
    const deep = {
      id: "l0",
      type: "view",
      children: [
        {
          id: "l1",
          type: "view",
          children: [
            {
              id: "l2",
              type: "view",
              children: [
                {
                  id: "l3",
                  type: "view",
                  children: [{ id: "l4", type: "text" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateNode(deep)).toBeNull();
  });
});

describe("AUP Patch Op Validation", () => {
  // ── Happy Path ──

  test("valid create op passes", () => {
    expect(
      validatePatchOp({
        op: "create",
        id: "new",
        parentId: "root",
        node: { id: "new", type: "text" },
      }),
    ).toBeNull();
  });

  test("valid update op passes", () => {
    expect(validatePatchOp({ op: "update", id: "n1", props: { label: "X" } })).toBeNull();
  });

  test("valid remove op passes", () => {
    expect(validatePatchOp({ op: "remove", id: "n1" })).toBeNull();
  });

  test("valid reorder op passes", () => {
    expect(validatePatchOp({ op: "reorder", id: "n1", parentId: "root", index: 0 })).toBeNull();
  });

  // ── Bad Path ──

  test("null op returns error", () => {
    expect(validatePatchOp(null)).toBe("patch op must be an object");
  });

  test("unknown op type returns error", () => {
    expect(validatePatchOp({ op: "replace", id: "n1" })).toBe("unknown patch op type: replace");
  });

  test("create without parentId returns error", () => {
    expect(validatePatchOp({ op: "create", id: "n", node: { id: "n", type: "view" } })).toBe(
      "create op requires parentId",
    );
  });

  test("create without node returns error", () => {
    expect(validatePatchOp({ op: "create", id: "n", parentId: "root" })).toBe(
      "create op requires node",
    );
  });

  test("update without id returns error", () => {
    expect(validatePatchOp({ op: "update" })).toBe("update op requires id");
  });

  test("reorder without index returns error", () => {
    expect(validatePatchOp({ op: "reorder", id: "n", parentId: "root" })).toBe(
      "reorder op requires numeric index",
    );
  });
});

// ── Device Capabilities ──

describe("DeviceCaps Validation", () => {
  // ── Happy Path ──

  test("valid minimal caps passes", () => {
    expect(
      validateDeviceCaps({
        platform: "web",
        formFactor: "desktop",
        primitives: { text: "webview" },
      }),
    ).toBeNull();
  });

  test("valid full caps passes", () => {
    const caps: DeviceCaps = {
      platform: "ios",
      formFactor: "phone",
      display: { type: "visual", color: "full", refresh: "realtime", depth: "2d" },
      input: { touch: true, keyboard: true, voice: true },
      primitives: fillPrimitives({ text: "native", chart: "webview" }, "unsupported"),
      features: { camera: true, gps: true, biometric: true },
    };
    expect(validateDeviceCaps(caps)).toBeNull();
  });

  test("all four PrimitiveCap values accepted", () => {
    expect(
      validateDeviceCaps({
        platform: "test",
        formFactor: "test",
        primitives: { a: "native", b: "webview", c: "partial", d: "unsupported" },
      }),
    ).toBeNull();
  });

  // ── Bad Path ──

  test("null caps returns error", () => {
    expect(validateDeviceCaps(null)).toBe("caps must be an object");
  });

  test("non-object caps returns error", () => {
    expect(validateDeviceCaps("web")).toBe("caps must be an object");
  });

  test("missing platform returns error", () => {
    expect(validateDeviceCaps({ formFactor: "desktop", primitives: {} })).toBe(
      "caps.platform is required and must be a string",
    );
  });

  test("missing formFactor returns error", () => {
    expect(validateDeviceCaps({ platform: "web", primitives: {} })).toBe(
      "caps.formFactor is required and must be a string",
    );
  });

  test("missing primitives returns error", () => {
    expect(validateDeviceCaps({ platform: "web", formFactor: "desktop" })).toBe(
      "caps.primitives is required and must be an object",
    );
  });

  test("array primitives returns error", () => {
    expect(validateDeviceCaps({ platform: "web", formFactor: "desktop", primitives: [] })).toBe(
      "caps.primitives is required and must be an object",
    );
  });

  test("invalid primitive cap value returns error", () => {
    expect(
      validateDeviceCaps({
        platform: "web",
        formFactor: "desktop",
        primitives: { text: "full" },
      }),
    ).toBe("caps.primitives.text must be one of: native, webview, partial, unsupported");
  });

  test("non-string primitive cap value returns error", () => {
    expect(
      validateDeviceCaps({
        platform: "web",
        formFactor: "desktop",
        primitives: { text: true },
      }),
    ).toBe("caps.primitives.text must be one of: native, webview, partial, unsupported");
  });
});

describe("fillPrimitives", () => {
  test("fills all primitives with fallback", () => {
    const result = fillPrimitives({}, "unsupported");
    expect(Object.keys(result)).toHaveLength(AUP_PRIMITIVES.length);
    for (const p of AUP_PRIMITIVES) {
      expect(result[p]).toBe("unsupported");
    }
  });

  test("overrides take precedence over fallback", () => {
    const result = fillPrimitives({ text: "native", chart: "webview" }, "unsupported");
    expect(result.text).toBe("native");
    expect(result.chart).toBe("webview");
    expect(result.view).toBe("unsupported");
  });
});

describe("Default Device Caps Presets", () => {
  test("TTY: only text is native, all others unsupported", () => {
    expect(DEVICE_CAPS_TTY.platform).toBe("cli");
    expect(DEVICE_CAPS_TTY.primitives.text).toBe("native");
    expect(DEVICE_CAPS_TTY.primitives.chart).toBe("unsupported");
    expect(DEVICE_CAPS_TTY.primitives.view).toBe("unsupported");
    expect(validateDeviceCaps(DEVICE_CAPS_TTY)).toBeNull();
  });

  test("Term: text native, all others unsupported (terminal is now a component)", () => {
    expect(DEVICE_CAPS_TERM.primitives.text).toBe("native");
    expect(DEVICE_CAPS_TERM.primitives.chart).toBe("unsupported");
    expect(validateDeviceCaps(DEVICE_CAPS_TERM)).toBeNull();
  });

  test("Web chat: chat/text/overlay/media/action webview, others unsupported", () => {
    expect(DEVICE_CAPS_WEB_CHAT.primitives.chat).toBe("webview");
    expect(DEVICE_CAPS_WEB_CHAT.primitives.text).toBe("webview");
    expect(DEVICE_CAPS_WEB_CHAT.primitives.overlay).toBe("webview");
    expect(DEVICE_CAPS_WEB_CHAT.primitives.chart).toBe("unsupported");
    // terminal is a component now, not in primitives map
    expect(validateDeviceCaps(DEVICE_CAPS_WEB_CHAT)).toBeNull();
  });

  test("Web full: all primitives webview", () => {
    for (const p of AUP_PRIMITIVES) {
      expect(DEVICE_CAPS_WEB_FULL.primitives[p]).toBe("webview");
    }
    expect(validateDeviceCaps(DEVICE_CAPS_WEB_FULL)).toBeNull();
  });

  test("all presets have all primitives", () => {
    for (const preset of [
      DEVICE_CAPS_TTY,
      DEVICE_CAPS_TERM,
      DEVICE_CAPS_WEB_CHAT,
      DEVICE_CAPS_WEB_FULL,
    ]) {
      for (const p of AUP_PRIMITIVES) {
        expect(preset.primitives[p]).toBeDefined();
      }
    }
  });
});
