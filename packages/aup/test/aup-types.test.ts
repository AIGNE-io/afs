import { describe, expect, test } from "bun:test";
import {
  AUP_PRIMITIVES,
  type AUPNode,
  DEGRADATION_CHAINS,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_FULL,
  degradeTree,
  fillPrimitives,
  validateDeviceCaps,
  validateNode,
  validatePatchOp,
} from "@aigne/afs-aup";

describe("AUP types", () => {
  test("AUP_PRIMITIVES includes core types", () => {
    expect(AUP_PRIMITIVES).toContain("view");
    expect(AUP_PRIMITIVES).toContain("text");
    expect(AUP_PRIMITIVES).toContain("media");
    expect(AUP_PRIMITIVES).toContain("action");
    expect(AUP_PRIMITIVES).toContain("afs-list");
    expect(AUP_PRIMITIVES.length).toBeGreaterThan(10);
  });

  test("fillPrimitives builds complete map with fallback", () => {
    const result = fillPrimitives({ text: "native" }, "unsupported");
    expect(result.text).toBe("native");
    expect(result.view).toBe("unsupported");
    expect(result.media).toBe("unsupported");
    expect(Object.keys(result).length).toBe(AUP_PRIMITIVES.length);
  });

  test("DEVICE_CAPS_TTY is text-only", () => {
    expect(DEVICE_CAPS_TTY.platform).toBe("cli");
    expect(DEVICE_CAPS_TTY.primitives.text).toBe("native");
    expect(DEVICE_CAPS_TTY.primitives.media).toBe("unsupported");
  });

  test("DEVICE_CAPS_WEB_FULL supports everything", () => {
    expect(DEVICE_CAPS_WEB_FULL.platform).toBe("web");
    for (const p of AUP_PRIMITIVES) {
      expect(DEVICE_CAPS_WEB_FULL.primitives[p]).toBe("webview");
    }
  });
});

describe("validateDeviceCaps", () => {
  test("valid caps pass", () => {
    expect(validateDeviceCaps(DEVICE_CAPS_WEB_FULL)).toBeNull();
    expect(validateDeviceCaps(DEVICE_CAPS_TTY)).toBeNull();
  });

  test("rejects missing platform", () => {
    expect(validateDeviceCaps({ formFactor: "desktop", primitives: {} })).toContain("platform");
  });

  test("rejects invalid primitive cap value", () => {
    const bad = { platform: "web", formFactor: "desktop", primitives: { text: "bogus" } };
    expect(validateDeviceCaps(bad)).toContain("text");
  });
});

describe("validateNode", () => {
  test("valid node passes", () => {
    const node: AUPNode = { id: "root", type: "view", children: [] };
    expect(validateNode(node)).toBeNull();
  });

  test("rejects missing id", () => {
    expect(validateNode({ type: "view" })).toContain("id");
  });

  test("rejects javascript: in src", () => {
    expect(validateNode({ id: "x", type: "view", src: "javascript:alert(1)" })).toContain(
      "javascript:",
    );
  });

  test("rejects path traversal in src", () => {
    expect(validateNode({ id: "x", type: "view", src: "../secret/file" })).toContain("..");
    expect(validateNode({ id: "x", type: "view", src: "/a/../b" })).toContain("..");
  });

  test("allows normal paths in src", () => {
    expect(validateNode({ id: "x", type: "view", src: "/data/items" })).toBeNull();
    expect(validateNode({ id: "x", type: "view", src: "/path/to..name" })).toBeNull();
  });

  test("rejects path traversal in bind", () => {
    expect(validateNode({ id: "x", type: "input", bind: "../../etc/passwd" })).toContain("..");
  });

  test("rejects path traversal in event exec", () => {
    const node = {
      id: "x",
      type: "action",
      events: { click: { exec: "/mount/../other/secret" } },
    };
    expect(validateNode(node)).toContain("..");
  });

  test("allows normal event exec paths", () => {
    const node = {
      id: "x",
      type: "action",
      events: { click: { exec: "/actions/submit" } },
    };
    expect(validateNode(node)).toBeNull();
  });
});

describe("validatePatchOp", () => {
  test("valid create op passes", () => {
    const op = { op: "create", id: "a", parentId: "root", node: { id: "a", type: "text" } };
    expect(validatePatchOp(op)).toBeNull();
  });

  test("rejects unknown op type", () => {
    expect(validatePatchOp({ op: "bogus" })).toContain("unknown");
  });

  test("rejects update op with no fields", () => {
    expect(validatePatchOp({ op: "update", id: "a" })).toContain("at least one");
  });

  test("accepts update op with props", () => {
    expect(validatePatchOp({ op: "update", id: "a", props: { label: "hi" } })).toBeNull();
  });

  test("accepts update op with state", () => {
    expect(validatePatchOp({ op: "update", id: "a", state: { open: true } })).toBeNull();
  });

  test("accepts update op with events", () => {
    expect(
      validatePatchOp({ op: "update", id: "a", events: { click: { exec: "/x" } } }),
    ).toBeNull();
  });

  test("accepts update op with src", () => {
    expect(validatePatchOp({ op: "update", id: "a", src: "/data/team" })).toBeNull();
  });

  test("accepts update op with src + props", () => {
    expect(
      validatePatchOp({ op: "update", id: "a", src: "/data/team", props: { showStatus: true } }),
    ).toBeNull();
  });

  test("rejects update op with only src: empty string", () => {
    expect(validatePatchOp({ op: "update", id: "a", src: "" })).toContain("src");
  });
});

describe("validateNode — event target+set", () => {
  test("allows event with target and set", () => {
    const node = {
      id: "sidebar",
      type: "surface",
      events: {
        select: { target: "primary", set: { src: "/data/projects" } },
      },
    };
    expect(validateNode(node)).toBeNull();
  });

  test("allows event with target+set and args placeholders", () => {
    const node = {
      id: "sidebar",
      type: "surface",
      events: {
        select: { target: "primary", set: { src: "$args.path" } },
      },
    };
    expect(validateNode(node)).toBeNull();
  });

  test("allows event with target+set for state", () => {
    const node = {
      id: "btn",
      type: "action",
      events: {
        click: { target: "overlay-1", set: { state: { open: true } } },
      },
    };
    expect(validateNode(node)).toBeNull();
  });

  test("rejects event target+set with javascript: in src", () => {
    const node = {
      id: "x",
      type: "surface",
      events: {
        select: { target: "y", set: { src: "javascript:alert(1)" } },
      },
    };
    expect(validateNode(node)).toContain("javascript:");
  });

  test("rejects event target+set with path traversal in src", () => {
    const node = {
      id: "x",
      type: "surface",
      events: {
        select: { target: "y", set: { src: "../secret" } },
      },
    };
    expect(validateNode(node)).toContain("..");
  });

  test("allows event with only exec (backward compat)", () => {
    const node = {
      id: "btn",
      type: "action",
      events: { click: { exec: "/actions/submit" } },
    };
    expect(validateNode(node)).toBeNull();
  });
});

describe("degradeTree", () => {
  test("passes through supported nodes", () => {
    const node: AUPNode = { id: "t", type: "text", props: { content: "hello" } };
    const result = degradeTree(node, DEVICE_CAPS_WEB_FULL);
    expect(result).toBe(node); // same reference — no degradation needed
  });

  test("degrades chart to table on TTY", () => {
    const node: AUPNode = { id: "c", type: "chart", props: { content: "data" } };
    const result = degradeTree(node, DEVICE_CAPS_TTY);
    // chart → table → text (TTY only supports text)
    expect(result.type).toBe("text");
    expect(result.props?._degradedFrom).toBe("chart");
  });

  test("DEGRADATION_CHAINS has expected entries", () => {
    expect(DEGRADATION_CHAINS.chart).toEqual(["table", "text"]);
    expect(DEGRADATION_CHAINS.terminal).toBeUndefined();
    expect(DEGRADATION_CHAINS.rtc).toEqual(["unsupported"]);
  });
});
