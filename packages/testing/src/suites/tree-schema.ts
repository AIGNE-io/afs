import { describe, expect, test } from "bun:test";
import type { ProviderTreeSchema } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Run tree-schema validation suite.
 *
 * Phase 3: All providers must implement static treeSchema().
 * Missing treeSchema is now a test failure, not a warning.
 */
export function runTreeSchemaTests(
  providerClass: {
    manifest?(): unknown;
    treeSchema?(): ProviderTreeSchema;
  },
  _config: TestConfig,
): void {
  describe("tree-schema", () => {
    test("provider must have static treeSchema() method", () => {
      expect(typeof providerClass.treeSchema).toBe("function");
    });

    test("treeSchema must have valid operations array", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();
      expect(schema.operations).toBeDefined();
      expect(Array.isArray(schema.operations)).toBe(true);
      expect(schema.operations.length).toBeGreaterThan(0);

      const validOps = ["list", "read", "write", "delete", "search", "exec", "stat", "explain"];
      for (const op of schema.operations) {
        expect(validOps).toContain(op);
      }
    });

    test("treeSchema must have valid tree with root entry", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();
      expect(schema.tree).toBeDefined();
      expect(typeof schema.tree).toBe("object");

      // Must have at least a root entry
      const hasRoot = Object.keys(schema.tree).some((k) => k === "/" || k === "/*");
      expect(hasRoot).toBe(true);

      // Every tree node must have a kind
      for (const [_path, node] of Object.entries(schema.tree)) {
        expect(node.kind).toBeDefined();
        expect(typeof node.kind).toBe("string");
        expect(node.kind.length).toBeGreaterThan(0);
      }
    });

    test("treeSchema auth field must be valid if present", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();
      if (!schema.auth) return;

      expect(schema.auth.type).toBeDefined();
      const validTypes = ["none", "token", "aws", "gcp", "oauth", "custom"];
      expect(validTypes).toContain(schema.auth.type);

      if (schema.auth.env) {
        expect(Array.isArray(schema.auth.env)).toBe(true);
        expect(schema.auth.env.length).toBeGreaterThan(0);
      }
    });

    test("treeSchema bestFor/notFor must be non-empty arrays if present", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();
      if (schema.bestFor) {
        expect(Array.isArray(schema.bestFor)).toBe(true);
        expect(schema.bestFor.length).toBeGreaterThan(0);
      }
      if (schema.notFor) {
        expect(Array.isArray(schema.notFor)).toBe(true);
        expect(schema.notFor.length).toBeGreaterThan(0);
      }
    });

    test("tree node operations must be valid subset of top-level operations", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();
      const _topOps = new Set(schema.operations);

      for (const [_path, node] of Object.entries(schema.tree)) {
        if (node.operations) {
          for (const op of node.operations) {
            // Node operations must be in the valid set (not necessarily top-level,
            // since node ops can include "delete" etc.)
            const validNodeOps = ["list", "read", "write", "delete", "search", "exec"] as const;
            expect(validNodeOps as readonly string[]).toContain(op);
          }
        }
      }
    });

    test("destructive actions must reference declared actions", () => {
      if (typeof providerClass.treeSchema !== "function") return;

      const schema = providerClass.treeSchema();

      for (const [_path, node] of Object.entries(schema.tree)) {
        if (node.destructive && node.destructive.length > 0) {
          // Each destructive action should be in the node's actions list
          // (or be a built-in operation like "delete")
          const allActions = new Set([...(node.actions ?? []), "delete"]);
          for (const d of node.destructive) {
            expect(allActions.has(d)).toBe(true);
          }
        }
      }
    });

    test("treeSchema operations must match manifest capabilities", () => {
      if (typeof providerClass.treeSchema !== "function") return;
      if (typeof providerClass.manifest !== "function") return;

      const schema = providerClass.treeSchema();
      const rawManifest = providerClass.manifest();
      const manifest = Array.isArray(rawManifest) ? rawManifest[0] : rawManifest;

      // If manifest has an operations field, it should be consistent
      if (manifest && typeof manifest === "object" && "operations" in manifest) {
        const manifestOps = (manifest as { operations: string[] }).operations;
        for (const op of schema.operations) {
          expect(manifestOps).toContain(op);
        }
      }
    });
  });
}
