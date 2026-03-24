/**
 * Phase 2: AUP data binding types + validation tests.
 *
 * Tests that src/bind fields on AUPNode are accepted by validation
 * and that security checks work for binding paths.
 */
import { describe, expect, test } from "bun:test";
import { validateNode } from "@aigne/afs-ui";

describe("AUP data binding", () => {
  describe("src field validation", () => {
    test("accepts node with src path", () => {
      const err = validateNode({
        id: "chart1",
        type: "chart",
        src: "/monitoring/cpu",
        props: { variant: "line" },
      });
      expect(err).toBeNull();
    });

    test("rejects src with javascript: protocol", () => {
      const err = validateNode({
        id: "bad1",
        type: "chart",
        src: "javascript:alert(1)",
      });
      expect(err).not.toBeNull();
      expect(err).toContain("javascript:");
    });

    test("rejects non-string src", () => {
      const err = validateNode({
        id: "bad2",
        type: "chart",
        src: 42,
      });
      expect(err).not.toBeNull();
    });
  });

  describe("bind field validation", () => {
    test("accepts node with bind path", () => {
      const err = validateNode({
        id: "input1",
        type: "input",
        bind: "/thermostat/target",
        props: { inputType: "slider" },
      });
      expect(err).toBeNull();
    });

    test("rejects bind with javascript: protocol", () => {
      const err = validateNode({
        id: "bad3",
        type: "input",
        bind: "javascript:void(0)",
      });
      expect(err).not.toBeNull();
      expect(err).toContain("javascript:");
    });

    test("rejects non-string bind", () => {
      const err = validateNode({
        id: "bad4",
        type: "input",
        bind: { path: "/foo" },
      });
      expect(err).not.toBeNull();
    });
  });

  describe("combined src + bind", () => {
    test("accepts node with both src and bind", () => {
      const err = validateNode({
        id: "editor1",
        type: "editor",
        src: "/files/readme.md",
        bind: "/files/readme.md",
      });
      expect(err).toBeNull();
    });

    test("validates src/bind in nested children", () => {
      const err = validateNode({
        id: "root",
        type: "view",
        children: [
          { id: "c1", type: "chart", src: "/data/series" },
          { id: "c2", type: "input", bind: "javascript:evil()" },
        ],
      });
      expect(err).not.toBeNull();
      expect(err).toContain("javascript:");
    });
  });

  describe("events exec path (existing)", () => {
    test("accepts valid exec path in events", () => {
      const err = validateNode({
        id: "btn1",
        type: "action",
        events: { click: { exec: "/deploy/.actions/run", args: { env: "staging" } } },
      });
      expect(err).toBeNull();
    });

    test("rejects javascript: in exec path", () => {
      const err = validateNode({
        id: "btn2",
        type: "action",
        events: { click: { exec: "JavaScript:alert(1)" } },
      });
      expect(err).not.toBeNull();
    });
  });
});
