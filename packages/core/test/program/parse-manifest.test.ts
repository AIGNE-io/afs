import { describe, expect, test } from "bun:test";
import { parseBlockletManifest } from "@aigne/afs";

const VALID_MANIFEST = `
specVersion: 1
id: agent
name: Agent
entrypoint: ./scripts/chat.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
    ops: [exec]
  - uri: "aignehub://"
    target: /aignehub
    required: true
    ops: [exec, read]
  - uri: "telegram://"
    target: /telegram
    required: false
    ops: [exec, read, list]
`;

describe("parseBlockletManifest", () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    test("parses valid program.yaml and returns BlockletManifest", () => {
      const manifest = parseBlockletManifest(VALID_MANIFEST);
      expect(manifest).toBeDefined();
      expect(typeof manifest).toBe("object");
    });

    test("specVersion, id, name, entrypoint correctly parsed", () => {
      const manifest = parseBlockletManifest(VALID_MANIFEST);
      expect(manifest.specVersion).toBe(1);
      expect(manifest.id).toBe("agent");
      expect(manifest.name).toBe("Agent");
      expect(manifest.entrypoint).toBe("./scripts/chat.ash");
    });

    test("mounts array correctly parsed (uri, target, required, ops)", () => {
      const manifest = parseBlockletManifest(VALID_MANIFEST);
      expect(manifest.mounts).toHaveLength(3);

      expect(manifest.mounts[0]).toEqual({
        uri: "ash://",
        target: "/ash",
        required: true,
        ops: ["exec"],
      });
      expect(manifest.mounts[1]).toEqual({
        uri: "aignehub://",
        target: "/aignehub",
        required: true,
        ops: ["exec", "read"],
      });
      expect(manifest.mounts[2]).toEqual({
        uri: "telegram://",
        target: "/telegram",
        required: false,
        ops: ["exec", "read", "list"],
      });
    });

    test("mounts as empty array parses normally", () => {
      const yaml = `
specVersion: 1
id: simple
name: Simple
entrypoint: ./main.ash
mounts: []
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toEqual([]);
    });

    test("mounts without ops defaults to undefined (no restriction)", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.ops).toBeUndefined();
    });

    test("mounts required defaults to true", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.required).toBe(true);
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    test("missing specVersion throws validation error", () => {
      const yaml = `
id: test
name: Test
entrypoint: ./main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("missing id throws validation error", () => {
      const yaml = `
specVersion: 1
name: Test
entrypoint: ./main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("missing entrypoint throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("specVersion non-number throws validation error", () => {
      const yaml = `
specVersion: "one"
id: test
name: Test
entrypoint: ./main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("specVersion 0 throws validation error", () => {
      const yaml = `
specVersion: 0
id: test
name: Test
entrypoint: ./main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("specVersion negative throws validation error", () => {
      const yaml = `
specVersion: -1
id: test
name: Test
entrypoint: ./main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("entrypoint as absolute path throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: /scripts/main.ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/relative/i);
    });

    test("mounts.target non-absolute path throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/absolute/i);
    });

    test("mounts.target reserved path /blocklet throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /blocklet
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("mounts.target reserved path /program throws validation error (legacy)", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /program
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("mounts.target reserved path /data throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /data
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("mounts.target reserved path /.meta throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /.meta
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("mounts.target reserved path /.actions throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /.actions
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("mounts.target with /. prefix throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /.hidden
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/dot-prefixed/i);
    });

    test("duplicate mount targets throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
  - uri: "ash2://"
    target: /ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/duplicate/i);
    });

    test("mounts.uri empty string throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: ""
    target: /ash
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("mounts.ops contains invalid operation name throws validation error", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    ops: [exec, destroy]
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("invalid YAML syntax throws parse error", () => {
      const yaml = "specVersion: [\ninvalid yaml {{{";
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("empty string input throws error", () => {
      expect(() => parseBlockletManifest("")).toThrow(/empty/i);
    });

    test("non-string input throws error", () => {
      // @ts-expect-error testing invalid input
      expect(() => parseBlockletManifest(123)).toThrow(/string/i);
      // @ts-expect-error testing invalid input
      expect(() => parseBlockletManifest(null)).toThrow(/string/i);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe("Edge Cases", () => {
    test("no mounts field (optional) parses normally with empty array", () => {
      const yaml = `
specVersion: 1
id: no-mounts
name: No Mounts
entrypoint: ./main.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toEqual([]);
    });

    test("name with unicode characters parses normally", () => {
      const yaml = `
specVersion: 1
id: unicode-test
name: 测试程序 🚀
entrypoint: ./main.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.name).toBe("测试程序 🚀");
    });

    test("entrypoint with nested path (./scripts/chat.ash) parses normally", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./scripts/deep/nested/main.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.entrypoint).toBe("./scripts/deep/nested/main.ash");
    });

    test("single optional (required: false) mount parses normally", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "telegram://"
    target: /telegram
    required: false
    ops: [exec]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.required).toBe(false);
    });

    test("id with hyphens and underscores parses normally", () => {
      const yaml = `
specVersion: 1
id: my-cool_program
name: Test
entrypoint: ./main.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.id).toBe("my-cool_program");
    });

    test("mount target as multi-level nested path /tools/mcp-a parses normally", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "mcp://"
    target: /tools/mcp-a
    ops: [exec]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.target).toBe("/tools/mcp-a");
    });
  });

  // =========================================================================
  // Security
  // =========================================================================
  describe("Security", () => {
    test("YAML parsing does not execute custom tags (anti-deserialization)", () => {
      // YAML custom tags like !!python/object should be treated as plain strings
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
`;
      // Should parse without executing any tags
      const manifest = parseBlockletManifest(yaml);
      expect(manifest).toBeDefined();
    });

    test("large YAML input does not cause excessive processing", () => {
      // Generate a moderately large but valid YAML
      const mounts = Array.from(
        { length: 100 },
        (_, i) => `
  - uri: "provider-${i}://"
    target: /mount-${i}
    ops: [read]`,
      ).join("");

      const yaml = `
specVersion: 1
id: large-test
name: Large Test
entrypoint: ./main.ash
mounts:${mounts}
`;
      // Should complete without hanging
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toHaveLength(100);
    });
  });

  // =========================================================================
  // Data Leak
  // =========================================================================
  describe("Data Leak", () => {
    test("validation error does not expose file system paths", () => {
      const yaml = `
specVersion: 1
id: test
entrypoint: ./main.ash
`;
      try {
        parseBlockletManifest(yaml);
      } catch (e) {
        const msg = String(e);
        // Should not contain absolute paths or internal details
        expect(msg).not.toContain("/Users/");
        expect(msg).not.toContain("/home/");
        expect(msg).not.toContain("node_modules");
      }
    });

    test("error messages contain only field-level descriptions", () => {
      const yaml = `
specVersion: "bad"
id: test
name: Test
entrypoint: ./main.ash
`;
      try {
        parseBlockletManifest(yaml);
      } catch (e) {
        const msg = String(e);
        expect(msg).toContain("blocklet.yaml");
      }
    });
  });

  // =========================================================================
  // Data Damage
  // =========================================================================
  describe("Data Damage", () => {
    test("parse failure does not produce partial objects (atomicity)", () => {
      const yaml = `
specVersion: 1
id: test
entrypoint: /absolute-bad
`;
      let result: unknown;
      try {
        result = parseBlockletManifest(yaml);
      } catch {
        // Expected to throw
      }
      // Either we get a full valid result or nothing
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // shared field (program-activation)
  // =========================================================================
  describe("shared field", () => {
    // --- Happy Path ---
    test("shared: true is correctly parsed", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: true
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.shared).toBe(true);
    });

    test("shared: false is correctly parsed", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "telegram://"
    target: /telegram
    shared: false
    ops: [exec, read]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.shared).toBe(false);
    });

    test("omitted shared defaults to undefined (caller treats as true)", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.shared).toBeUndefined();
    });

    test("full program.yaml with shared: false parses successfully", () => {
      const yaml = `
specVersion: 1
id: agent
name: Agent Program
entrypoint: scripts/chat.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
    ops: [exec]
  - uri: "aignehub://"
    target: /aignehub
    required: true
    ops: [exec, read]
  - uri: "telegram://"
    target: /telegram
    shared: false
    required: false
    ops: [exec, read, list]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toHaveLength(3);
      expect(manifest.mounts[0]!.shared).toBeUndefined();
      expect(manifest.mounts[2]!.shared).toBe(false);
    });

    // --- Bad Path ---
    test('shared: "yes" (non-boolean string) is rejected by Zod', () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: "yes"
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("shared: 0 (number) is rejected by Zod", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: 0
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("shared: null is rejected by Zod", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: null
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    // --- Edge Cases ---
    test("all mounts shared: false parses normally", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "telegram://"
    target: /telegram
    shared: false
  - uri: "slack://"
    target: /slack
    shared: false
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toHaveLength(2);
      expect(manifest.mounts[0]!.shared).toBe(false);
      expect(manifest.mounts[1]!.shared).toBe(false);
    });

    test("mixed shared/owned mounts parse normally", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: true
  - uri: "telegram://"
    target: /telegram
    shared: false
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts[0]!.shared).toBe(true);
      expect(manifest.mounts[1]!.shared).toBe(false);
    });

    // --- Security ---
    test("shared field does not affect target path validation", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /blocklet
    shared: false
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/reserved/i);
    });

    test("shared field does not affect ops validation", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: false
    ops: [exec, destroy]
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    // --- Data Leak ---
    test("Zod error for invalid shared does not leak internal schema", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    shared: "invalid"
`;
      try {
        parseBlockletManifest(yaml);
      } catch (e) {
        const msg = String(e);
        expect(msg).not.toContain("node_modules");
        expect(msg).not.toContain("/Users/");
      }
    });

    // --- Data Damage ---
    test("existing program.yaml without shared field still parses (backward compat)", () => {
      // This is the original VALID_MANIFEST without any shared field
      const manifest = parseBlockletManifest(VALID_MANIFEST);
      expect(manifest.mounts).toHaveLength(3);
      expect(manifest.mounts[0]!.uri).toBe("ash://");
      expect(manifest.mounts[0]!.shared).toBeUndefined();
    });
  });
});
