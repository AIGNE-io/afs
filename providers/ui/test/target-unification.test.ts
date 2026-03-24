/**
 * Target Unification — page event mode deprecated, unified to target `_root`.
 *
 * { page: "x" } → backward compat (deprecated, still works)
 * { target: "_root", set: { page: "x" } } → new canonical form
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AUPNode } from "@aigne/afs-aup";
import { AUPSessionLogic } from "../src/aup-session-logic.js";

const PAGE_B: AUPNode = {
  id: "page-b",
  type: "view",
  children: [{ id: "page-b-text", type: "text", props: { content: "Page B" } }],
};

function createLogic(root: AUPNode): AUPSessionLogic {
  const logic = new AUPSessionLogic();
  logic.dispatch({ action: "render", root, options: { fullPage: true } });
  return logic;
}

// Tree with old-style page event
const treeWithPageEvent: AUPNode = {
  id: "root",
  type: "view",
  children: [
    {
      id: "nav-btn",
      type: "action",
      events: {
        click: { page: "dashboard" },
      },
    },
  ],
};

// Tree with new-style target _root event
const treeWithTargetRoot: AUPNode = {
  id: "root",
  type: "view",
  children: [
    {
      id: "nav-btn-new",
      type: "action",
      events: {
        click: { target: "_root", set: { page: "dashboard" } },
      },
    },
    {
      id: "detail",
      type: "surface",
      src: "/data",
    },
    {
      id: "update-btn",
      type: "action",
      events: {
        click: { target: "detail", set: { src: "/data/new" } },
      },
    },
  ],
};

describe("target unification", () => {
  // Capture console.warn for deprecation tests
  const originalWarn = console.warn;
  let warnMessages: string[] = [];

  afterEach(() => {
    console.warn = originalWarn;
    warnMessages = [];
  });

  function captureWarns() {
    warnMessages = [];
    console.warn = mock((...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    }) as typeof console.warn;
  }

  // ── backward compat — page mode still works ──

  describe("backward compat — page mode still works", () => {
    test("{ page: 'dashboard' } → full page render (result unchanged)", async () => {
      const logic = createLogic(treeWithPageEvent);
      logic.pageResolver = async (name: string) => {
        if (name === "dashboard") return { tree: PAGE_B };
        return undefined;
      };

      const result = await logic.handleEvent("nav-btn", "click");

      expect(result.returnValue).toEqual({ ok: true, page: "dashboard" });
      expect(result.broadcast).toBeDefined();
      expect(result.broadcast).toHaveLength(1);
      const msg = result.broadcast![0]!;
      expect(msg.action).toBe("render");
      expect(msg.fullPage).toBe(true);
      expect((msg.root as AUPNode).id).toBe("page-b");
    });

    test("{ page: 'dashboard' } → emits deprecation warning", async () => {
      captureWarns();
      const logic = createLogic(treeWithPageEvent);
      logic.pageResolver = async (name: string) => {
        if (name === "dashboard") return { tree: PAGE_B };
        return undefined;
      };

      await logic.handleEvent("nav-btn", "click");

      expect(warnMessages.length).toBeGreaterThanOrEqual(1);
      expect(warnMessages.some((m) => m.includes("deprecated"))).toBe(true);
    });
  });

  // ── target with page semantics ──

  describe("target with page semantics", () => {
    test("{ target: '_root', set: { page: 'dashboard' } } → full page render", async () => {
      const logic = createLogic(treeWithTargetRoot);
      logic.pageResolver = async (name: string) => {
        if (name === "dashboard") return { tree: PAGE_B };
        return undefined;
      };

      const result = await logic.handleEvent("nav-btn-new", "click");

      expect(result.returnValue).toEqual({ ok: true, page: "dashboard" });
      expect(result.broadcast).toBeDefined();
      const msg = result.broadcast![0]!;
      expect(msg.action).toBe("render");
      expect(msg.fullPage).toBe(true);
      expect((msg.root as AUPNode).id).toBe("page-b");
    });

    test("target '_root' result equals deprecated page mode result", async () => {
      // Setup two logics — one with old syntax, one with new
      const logicOld = createLogic(treeWithPageEvent);
      logicOld.pageResolver = async (name: string) => {
        if (name === "dashboard") return { tree: PAGE_B };
        return undefined;
      };

      const logicNew = createLogic(treeWithTargetRoot);
      logicNew.pageResolver = async (name: string) => {
        if (name === "dashboard") return { tree: PAGE_B };
        return undefined;
      };

      captureWarns(); // suppress deprecation warning noise
      const resultOld = await logicOld.handleEvent("nav-btn", "click");
      const resultNew = await logicNew.handleEvent("nav-btn-new", "click");

      // Same return value
      expect(resultNew.returnValue).toEqual(resultOld.returnValue);
      // Same broadcast structure (action, root, fullPage)
      const msgOld = resultOld.broadcast![0]!;
      const msgNew = resultNew.broadcast![0]!;
      expect(msgNew.action).toBe(msgOld.action);
      expect(msgNew.fullPage).toBe(msgOld.fullPage);
      expect((msgNew.root as AUPNode).id).toBe((msgOld.root as AUPNode).id);
    });

    test("target '_root' + unknown page → throws 'Page not found'", async () => {
      const logic = createLogic(treeWithTargetRoot);
      logic.pageResolver = async () => undefined;

      await expect(logic.handleEvent("nav-btn-new", "click")).rejects.toThrow(
        "Page not found: dashboard",
      );
    });
  });

  // ── target with component semantics — existing behavior preserved ──

  describe("target with component semantics — existing behavior preserved", () => {
    test("{ target: 'detail', set: { src: '/new' } } → patch node props", async () => {
      const logic = createLogic(treeWithTargetRoot);

      const result = await logic.handleEvent("update-btn", "click");

      const detail = logic.getStore().findNode("detail");
      expect(detail?.src).toBe("/data/new");
      expect(result.returnValue).toEqual({ ok: true, target: "detail" });
    });

    test("target nonexistent node → throws error", async () => {
      const tree: AUPNode = {
        id: "root",
        type: "view",
        children: [
          {
            id: "btn",
            type: "action",
            events: {
              click: { target: "nonexistent", set: { src: "/x" } },
            },
          },
        ],
      };
      const logic = createLogic(tree);

      await expect(logic.handleEvent("btn", "click")).rejects.toThrow();
    });
  });

  // ── no pageResolver configured ──

  describe("no pageResolver configured", () => {
    test("target '_root' + set.page + no pageResolver → throws error", async () => {
      const logic = createLogic(treeWithTargetRoot);
      // No pageResolver set

      await expect(logic.handleEvent("nav-btn-new", "click")).rejects.toThrow("No page resolver");
    });
  });
});
