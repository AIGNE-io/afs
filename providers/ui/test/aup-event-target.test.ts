/**
 * AUP Event Target — Tests for cross-node event targeting via target+set.
 *
 * When a node's event has `target` + `set` instead of `exec`, the server
 * resolves $args.* placeholders, creates an update patch op, applies it,
 * and broadcasts the patch.
 */
import { describe, expect, test } from "bun:test";
import type { AUPNode } from "@aigne/afs-aup";
import { AUPSessionLogic } from "../src/aup-session-logic.js";

function createLogic(root: AUPNode): AUPSessionLogic {
  const logic = new AUPSessionLogic();
  logic.dispatch({ action: "render", root, options: { fullPage: true } });
  return logic;
}

describe("event target+set — src update", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "sidebar",
        type: "surface",
        src: "/data",
        events: {
          select: { target: "primary", set: { src: "$args.path" } },
        },
      },
      {
        id: "primary",
        type: "surface",
        src: "/data",
      },
    ],
  };

  test("select event updates target node src", async () => {
    const logic = createLogic(tree);

    const result = await logic.handleEvent("sidebar", "select", {
      path: "/data/team",
    });

    // Target node src should be updated in the store
    const primaryNode = logic.getStore().findNode("primary");
    expect(primaryNode?.src).toBe("/data/team");

    // Should return success
    expect(result.returnValue).toEqual({ ok: true, target: "primary" });
  });

  test("broadcasts patch op to clients", async () => {
    const logic = createLogic(tree);

    const result = await logic.handleEvent("sidebar", "select", {
      path: "/data/projects",
    });

    // Should broadcast a patch with src update
    expect(result.broadcast).toBeDefined();
    expect(result.broadcast).toHaveLength(1);

    const patchMsg = result.broadcast![0]!;
    expect(patchMsg.action).toBe("patch");

    const ops = patchMsg.ops as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.op).toBe("update");
    expect(ops[0]!.id).toBe("primary");
    expect(ops[0]!.src).toBe("/data/projects");
  });

  test("resolves $args.* placeholders in set", async () => {
    const logic = createLogic(tree);

    await logic.handleEvent("sidebar", "select", {
      path: "/data/metrics",
    });

    const primaryNode = logic.getStore().findNode("primary");
    expect(primaryNode?.src).toBe("/data/metrics");
  });
});

describe("event target+set — state update", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "toggle-btn",
        type: "action",
        events: {
          click: { target: "panel", set: { state: { open: "$args.open" } } },
        },
      },
      {
        id: "panel",
        type: "overlay",
        state: { open: false },
      },
    ],
  };

  test("click event updates target node state", async () => {
    const logic = createLogic(tree);

    await logic.handleEvent("toggle-btn", "click", { open: true });

    const panel = logic.getStore().findNode("panel");
    expect(panel?.state?.open).toBe(true);
  });
});

describe("event target+set — props update", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "selector",
        type: "action",
        events: {
          click: {
            target: "display",
            set: { props: { content: "$args.label" } },
          },
        },
      },
      {
        id: "display",
        type: "text",
        props: { content: "initial" },
      },
    ],
  };

  test("click event updates target node props", async () => {
    const logic = createLogic(tree);

    await logic.handleEvent("selector", "click", { label: "Updated!" });

    const display = logic.getStore().findNode("display");
    expect(display?.props?.content).toBe("Updated!");
  });
});

describe("event target+set — error cases", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "btn",
        type: "action",
        events: {
          click: { target: "nonexistent", set: { src: "/data" } },
        },
      },
    ],
  };

  test("throws when target node does not exist", async () => {
    const logic = createLogic(tree);

    await expect(logic.handleEvent("btn", "click", {})).rejects.toThrow("not found");
  });
});

describe("event target+set — does not call onExecEvent", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "sidebar",
        type: "surface",
        src: "/data",
        events: {
          select: { target: "primary", set: { src: "$args.path" } },
        },
      },
      {
        id: "primary",
        type: "surface",
        src: "/data",
      },
    ],
  };

  test("target+set bypasses onExecEvent handler", async () => {
    const logic = createLogic(tree);

    let execCalled = false;
    logic.onExecEvent = async () => {
      execCalled = true;
      return undefined;
    };

    await logic.handleEvent("sidebar", "select", { path: "/data/team" });

    expect(execCalled).toBe(false);
    expect(logic.getStore().findNode("primary")?.src).toBe("/data/team");
  });
});

describe("event page — page navigation dispatch", () => {
  const _PAGE_A: AUPNode = {
    id: "page-a",
    type: "view",
    children: [{ id: "a-title", type: "text", props: { content: "Page A" } }],
  };

  const PAGE_B: AUPNode = {
    id: "page-b",
    type: "view",
    children: [{ id: "b-title", type: "text", props: { content: "Page B" } }],
  };

  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "nav-btn",
        type: "action",
        events: {
          click: { page: "page-b" },
        },
      },
    ],
  };

  test("page event triggers full page render via pageResolver", async () => {
    const logic = createLogic(tree);
    logic.pageResolver = async (name: string) => {
      if (name === "page-b") return { tree: PAGE_B, tone: "clean", palette: "neutral" };
      return undefined;
    };

    const result = await logic.handleEvent("nav-btn", "click");

    expect(result.returnValue).toEqual({ ok: true, page: "page-b" });
    expect(result.broadcast).toBeDefined();
    expect(result.broadcast).toHaveLength(1);
    const msg = result.broadcast![0]!;
    expect(msg.action).toBe("render");
    expect(msg.fullPage).toBe(true);
    expect(msg.tone).toBe("clean");
    expect(msg.palette).toBe("neutral");
    expect((msg.root as AUPNode).id).toBe("page-b");
  });

  test("page event with no style omits tone/palette from render", async () => {
    const logic = createLogic(tree);
    logic.pageResolver = async (name: string) => {
      if (name === "page-b") return { tree: PAGE_B };
      return undefined;
    };

    const result = await logic.handleEvent("nav-btn", "click");
    const msg = result.broadcast![0]!;
    expect(msg.tone).toBeUndefined();
    expect(msg.palette).toBeUndefined();
  });

  test("page event throws when page not found", async () => {
    const logic = createLogic(tree);
    logic.pageResolver = async () => undefined;

    await expect(logic.handleEvent("nav-btn", "click")).rejects.toThrow("Page not found: page-b");
  });

  test("page event throws when no pageResolver configured", async () => {
    const logic = createLogic(tree);
    // No pageResolver set

    await expect(logic.handleEvent("nav-btn", "click")).rejects.toThrow("No page resolver");
  });

  test("page event does not call onExecEvent", async () => {
    const logic = createLogic(tree);
    logic.pageResolver = async (name: string) => {
      if (name === "page-b") return { tree: PAGE_B };
      return undefined;
    };

    let execCalled = false;
    logic.onExecEvent = async () => {
      execCalled = true;
      return undefined;
    };

    await logic.handleEvent("nav-btn", "click");
    expect(execCalled).toBe(false);
  });

  test("page event takes priority over exec when both present", async () => {
    // If someone accidentally has both page and exec, page wins
    const mixedTree: AUPNode = {
      id: "root",
      type: "view",
      children: [
        {
          id: "btn",
          type: "action",
          events: {
            click: { page: "page-b", exec: "/should-not-run" } as any,
          },
        },
      ],
    };

    const logic = createLogic(mixedTree);
    logic.pageResolver = async (name: string) => {
      if (name === "page-b") return { tree: PAGE_B };
      return undefined;
    };

    let execCalled = false;
    logic.onExecEvent = async () => {
      execCalled = true;
      return undefined;
    };

    const result = await logic.handleEvent("btn", "click");
    expect(result.returnValue).toEqual({ ok: true, page: "page-b" });
    expect(execCalled).toBe(false);
  });
});

describe("event exec — backward compatibility", () => {
  const tree: AUPNode = {
    id: "root",
    type: "view",
    children: [
      {
        id: "btn",
        type: "action",
        events: {
          click: { exec: "/actions/submit", args: { x: 1 } },
        },
      },
    ],
  };

  test("exec events still work as before", async () => {
    const logic = createLogic(tree);

    let receivedArgs: Record<string, unknown> | undefined;
    logic.onExecEvent = async (_nodeId, _event, _exec, args) => {
      receivedArgs = args;
      return { ok: true };
    };

    const result = await logic.handleEvent("btn", "click", { extra: 2 });

    expect(receivedArgs).toBeDefined();
    expect(receivedArgs!.x).toBe(1);
    expect(receivedArgs!.extra).toBe(2);
    expect(result.returnValue).toEqual({ ok: true });
  });
});
