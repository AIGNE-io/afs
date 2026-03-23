/**
 * AUPSceneManager — Unit tests for server-side scene store with LRU eviction.
 */
import { describe, expect, test } from "bun:test";
import { AUPSceneManager } from "../src/aup-protocol.js";
import type { AUPNode } from "../src/aup-types.js";

function makeTree(id: string): AUPNode {
  return {
    id,
    type: "view",
    children: [{ id: `${id}-t`, type: "text", props: { content: `Scene ${id}` } }],
  };
}

describe("AUPSceneManager", () => {
  test("stage stores scene, getScene returns it", () => {
    const mgr = new AUPSceneManager();
    const root = makeTree("s1");
    mgr.stage("s1", root);
    const store = mgr.getScene("s1");
    expect(store).toBeDefined();
    expect(store!.getRoot()!.id).toBe("s1");
  });

  test("stage twice overwrites — same store, version increments", () => {
    const mgr = new AUPSceneManager();
    mgr.stage("s1", makeTree("s1"));
    const store1 = mgr.getScene("s1");
    const v1 = store1!.version;

    mgr.stage("s1", makeTree("s1-v2"));
    const store2 = mgr.getScene("s1");
    expect(store2).toBe(store1); // same instance
    expect(store2!.version).toBeGreaterThan(v1);
    expect(store2!.getRoot()!.id).toBe("s1-v2");
  });

  test("take sets activeSceneId", () => {
    const mgr = new AUPSceneManager();
    mgr.stage("s1", makeTree("s1"));
    expect(mgr.activeSceneId).toBeNull();

    mgr.take("s1");
    expect(mgr.activeSceneId).toBe("s1");
  });

  test("take nonexistent throws", () => {
    const mgr = new AUPSceneManager();
    expect(() => mgr.take("nope")).toThrow(/not found|not staged/i);
  });

  test("release removes scene", () => {
    const mgr = new AUPSceneManager();
    mgr.stage("s1", makeTree("s1"));
    mgr.stage("s2", makeTree("s2"));
    mgr.take("s1");

    mgr.release("s2");
    expect(mgr.getScene("s2")).toBeUndefined();
  });

  test("release active scene throws", () => {
    const mgr = new AUPSceneManager();
    mgr.stage("s1", makeTree("s1"));
    mgr.take("s1");

    expect(() => mgr.release("s1")).toThrow(/active|live/i);
  });

  test("LRU eviction: stage 4 scenes with maxScenes=3, oldest non-active evicted", () => {
    const mgr = new AUPSceneManager({ maxScenes: 3 });
    mgr.stage("a", makeTree("a"));
    mgr.stage("b", makeTree("b"));
    mgr.stage("c", makeTree("c"));
    // a is oldest, c is newest
    mgr.stage("d", makeTree("d"));
    // a should be evicted (oldest non-active)
    expect(mgr.getScene("a")).toBeUndefined();
    expect(mgr.getScene("b")).toBeDefined();
    expect(mgr.getScene("c")).toBeDefined();
    expect(mgr.getScene("d")).toBeDefined();
  });

  test("active scene is never evicted by LRU", () => {
    const mgr = new AUPSceneManager({ maxScenes: 3 });
    mgr.stage("a", makeTree("a"));
    mgr.take("a"); // a is now active
    mgr.stage("b", makeTree("b"));
    mgr.stage("c", makeTree("c"));
    // Now at capacity: a (active), b, c
    mgr.stage("d", makeTree("d"));
    // a is active so must survive; b is oldest non-active, should be evicted
    expect(mgr.getScene("a")).toBeDefined();
    expect(mgr.getScene("b")).toBeUndefined();
    expect(mgr.getScene("c")).toBeDefined();
    expect(mgr.getScene("d")).toBeDefined();
  });

  test("getActiveScene returns active store + sceneId", () => {
    const mgr = new AUPSceneManager();
    expect(mgr.getActiveScene()).toBeNull();

    mgr.stage("s1", makeTree("s1"));
    mgr.take("s1");

    const active = mgr.getActiveScene();
    expect(active).not.toBeNull();
    expect(active!.sceneId).toBe("s1");
    expect(active!.store.getRoot()!.id).toBe("s1");
  });

  test("applyPatch patches a staged scene", () => {
    const mgr = new AUPSceneManager();
    mgr.stage("s1", makeTree("s1"));

    const store = mgr.getScene("s1")!;
    const v = store.version;
    mgr.applyPatch("s1", [{ op: "update", id: "s1-t", props: { content: "Updated" } }]);

    const node = store.findNode("s1-t");
    expect(node!.props!.content).toBe("Updated");
    expect(store.version).toBeGreaterThan(v);
  });
});
