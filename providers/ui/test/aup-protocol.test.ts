/**
 * AUP Protocol — Node store + patch engine tests.
 */
import { describe, expect, test } from "bun:test";
import { AUPNodeStore } from "../src/aup-protocol.js";
import type { AUPNode, AUPPatchOp } from "../src/aup-types.js";

function makeTree(): AUPNode {
  return {
    id: "root",
    type: "view",
    children: [
      { id: "t1", type: "text", props: { content: "Hello" } },
      { id: "t2", type: "text", props: { content: "World" } },
      {
        id: "a1",
        type: "action",
        props: { label: "Click" },
        events: { click: { exec: "/test/.actions/do" } },
      },
    ],
  };
}

describe("AUPNodeStore — setRoot / getRoot", () => {
  test("stores and returns root node", () => {
    const store = new AUPNodeStore();
    const tree = makeTree();
    store.setRoot(tree);
    expect(store.getRoot()).toEqual(tree);
  });

  test("replaces previous root", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    const newRoot: AUPNode = { id: "r2", type: "view" };
    store.setRoot(newRoot);
    expect(store.getRoot()?.id).toBe("r2");
  });

  test("rejects invalid root (missing id)", () => {
    const store = new AUPNodeStore();
    expect(() => store.setRoot({ type: "view" } as AUPNode)).toThrow("node.id is required");
  });

  test("rejects root with javascript: exec", () => {
    const store = new AUPNodeStore();
    expect(() =>
      store.setRoot({
        id: "r",
        type: "action",
        events: { click: { exec: "javascript:alert(1)" } },
      }),
    ).toThrow("javascript:");
  });

  test("findNode returns node by id", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(store.findNode("t1")?.props?.content).toBe("Hello");
  });

  test("findNode returns undefined for non-existent id", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(store.findNode("nope")).toBeUndefined();
  });

  test("clear removes graph", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.clear();
    expect(store.getRoot()).toBeNull();
    expect(store.findNode("root")).toBeUndefined();
  });
});

describe("AUPNodeStore — Patch: create", () => {
  test("appends child to parent", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([
      { op: "create", id: "new1", parentId: "root", node: { id: "new1", type: "text" } },
    ]);
    expect(store.getRoot()!.children!.length).toBe(4);
    expect(store.findNode("new1")?.type).toBe("text");
  });

  test("inserts at specific index", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([
      {
        op: "create",
        id: "first",
        parentId: "root",
        node: { id: "first", type: "text" },
        index: 0,
      },
    ]);
    expect(store.getRoot()!.children![0]!.id).toBe("first");
  });

  test("throws on duplicate id", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() =>
      store.applyPatch([
        { op: "create", id: "t1", parentId: "root", node: { id: "t1", type: "text" } },
      ]),
    ).toThrow("already exists");
  });

  test("throws on non-existent parent", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() =>
      store.applyPatch([
        { op: "create", id: "x", parentId: "nope", node: { id: "x", type: "text" } },
      ]),
    ).toThrow("not found");
  });
});

describe("AUPNodeStore — Patch: update", () => {
  test("merges props", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([{ op: "update", id: "t1", props: { content: "Updated", style: "bold" } }]);
    expect(store.findNode("t1")!.props!.content).toBe("Updated");
    expect(store.findNode("t1")!.props!.style).toBe("bold");
  });

  test("merges state", () => {
    const store = new AUPNodeStore();
    store.setRoot({
      id: "root",
      type: "view",
      state: { expanded: false },
    });
    store.applyPatch([{ op: "update", id: "root", state: { expanded: true, selected: 0 } }]);
    expect(store.findNode("root")!.state!.expanded).toBe(true);
    expect(store.findNode("root")!.state!.selected).toBe(0);
  });

  test("replaces events", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([
      { op: "update", id: "a1", events: { click: { exec: "/new/.actions/run" } } },
    ]);
    expect(store.findNode("a1")!.events!.click!.exec).toBe("/new/.actions/run");
  });

  test("empty props is no-op", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([{ op: "update", id: "t1", props: {} }]);
    expect(store.findNode("t1")!.props!.content).toBe("Hello");
  });

  test("throws on non-existent node", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() => store.applyPatch([{ op: "update", id: "nope", props: { x: 1 } }])).toThrow(
      "not found",
    );
  });
});

describe("AUPNodeStore — Patch: remove", () => {
  test("removes node and unindexes", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([{ op: "remove", id: "t1" }]);
    expect(store.getRoot()!.children!.length).toBe(2);
    expect(store.findNode("t1")).toBeUndefined();
  });

  test("removes root clears graph", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([{ op: "remove", id: "root" }]);
    expect(store.getRoot()).toBeNull();
  });

  test("removes subtree (children unindexed)", () => {
    const store = new AUPNodeStore();
    store.setRoot({
      id: "root",
      type: "view",
      children: [
        {
          id: "panel",
          type: "view",
          children: [
            { id: "inner1", type: "text" },
            { id: "inner2", type: "text" },
          ],
        },
      ],
    });
    store.applyPatch([{ op: "remove", id: "panel" }]);
    expect(store.findNode("panel")).toBeUndefined();
    expect(store.findNode("inner1")).toBeUndefined();
    expect(store.findNode("inner2")).toBeUndefined();
  });

  test("throws on non-existent node", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() => store.applyPatch([{ op: "remove", id: "nope" }])).toThrow("not found");
  });
});

describe("AUPNodeStore — Patch: reorder", () => {
  test("moves node to index 0", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([{ op: "reorder", id: "a1", parentId: "root", index: 0 }]);
    expect(store.getRoot()!.children![0]!.id).toBe("a1");
  });

  test("throws on out-of-bounds index", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() =>
      store.applyPatch([{ op: "reorder", id: "t1", parentId: "root", index: 99 }]),
    ).toThrow("out of bounds");
  });

  test("throws on non-existent node", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    expect(() =>
      store.applyPatch([{ op: "reorder", id: "nope", parentId: "root", index: 0 }]),
    ).toThrow("not found");
  });
});

describe("AUPNodeStore — Batch atomicity", () => {
  test("failed batch rolls back entirely", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    const ops: AUPPatchOp[] = [
      { op: "create", id: "ok1", parentId: "root", node: { id: "ok1", type: "text" } },
      { op: "update", id: "nope", props: { x: 1 } }, // will fail
    ];
    expect(() => store.applyPatch(ops)).toThrow("not found");
    // ok1 should NOT exist — rolled back
    expect(store.findNode("ok1")).toBeUndefined();
    expect(store.getRoot()!.children!.length).toBe(3); // original
  });

  test("patch without active graph throws", () => {
    const store = new AUPNodeStore();
    expect(() => store.applyPatch([{ op: "update", id: "x", props: {} }])).toThrow(
      "No active AUP graph",
    );
  });

  test("multiple ops in batch execute in order", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([
      { op: "create", id: "new1", parentId: "root", node: { id: "new1", type: "text" } },
      { op: "update", id: "new1", props: { content: "Created and updated" } },
    ]);
    expect(store.findNode("new1")!.props!.content).toBe("Created and updated");
  });

  test("create + update + remove on same node in batch", () => {
    const store = new AUPNodeStore();
    store.setRoot(makeTree());
    store.applyPatch([
      { op: "create", id: "temp", parentId: "root", node: { id: "temp", type: "text" } },
      { op: "update", id: "temp", props: { content: "Brief" } },
      { op: "remove", id: "temp" },
    ]);
    expect(store.findNode("temp")).toBeUndefined();
    expect(store.getRoot()!.children!.length).toBe(3);
  });
});
