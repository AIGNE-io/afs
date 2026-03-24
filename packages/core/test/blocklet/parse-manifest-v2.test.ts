import { describe, expect, test } from "bun:test";
import { parseBlockletManifest } from "@aigne/afs";

const VALID_V2_MINIMAL = `
specVersion: 2
id: sites
name: Sites
`;

const VALID_V2_COMPOSITION = `
specVersion: 2
id: desktop
name: AFS Desktop
description: Window manager desktop

system:
  - /dev/ui
  - /dev/web
  - /dev/ai

blocklets:
  - terminal
  - explorer
  - sites
  - command-bar
`;

describe("parseBlockletManifest — specVersion 2", () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    test("parses minimal v2 manifest", () => {
      const manifest = parseBlockletManifest(VALID_V2_MINIMAL);
      expect(manifest.specVersion).toBe(2);
      expect(manifest.id).toBe("sites");
      expect(manifest.name).toBe("Sites");
      expect(manifest.mounts).toEqual([]);
    });

    test("parses v2 manifest with composition", () => {
      const manifest = parseBlockletManifest(VALID_V2_COMPOSITION);
      expect(manifest.id).toBe("desktop");
      expect(manifest.description).toBe("Window manager desktop");
    });

    test("blocklets array is correctly parsed", () => {
      const manifest = parseBlockletManifest(VALID_V2_COMPOSITION);
      expect(manifest.blocklets).toEqual(["terminal", "explorer", "sites", "command-bar"]);
    });

    test("system array is correctly parsed", () => {
      const manifest = parseBlockletManifest(VALID_V2_COMPOSITION);
      expect(manifest.system).toEqual(["/dev/ui", "/dev/web", "/dev/ai"]);
    });

    test("v2 with mounts", () => {
      const yaml = `
specVersion: 2
id: sites
name: Sites
mounts:
  - uri: "web://"
    target: /web
    required: true
    ops: [read, list]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.mounts).toHaveLength(1);
      expect(manifest.mounts[0]).toEqual({
        uri: "web://",
        target: "/web",
        required: true,
        ops: ["read", "list"],
      });
    });

    test("v2 with optional entrypoint (ASH script)", () => {
      const yaml = `
specVersion: 2
id: smart-widget
name: Smart Widget
entrypoint: scripts/handler.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.entrypoint).toBe("scripts/handler.ash");
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    test("blocklets with empty string throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
blocklets:
  - ""
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("duplicate mount targets in v2 throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
mounts:
  - uri: "web://"
    target: /web
  - uri: "web2://"
    target: /web
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/duplicate/i);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe("Edge Cases", () => {
    test("v2 with no optional fields parses", () => {
      const manifest = parseBlockletManifest(VALID_V2_MINIMAL);
      expect(manifest.specVersion).toBe(2);
      expect(manifest.blocklets).toBeUndefined();
      expect(manifest.system).toBeUndefined();
      expect(manifest.entrypoint).toBeUndefined();
    });

    test("v1 manifest still parses correctly", () => {
      const yaml = `
specVersion: 1
id: agent
name: Agent
entrypoint: ./scripts/chat.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
    ops: [exec]
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.specVersion).toBe(1);
      expect(manifest.entrypoint).toBe("./scripts/chat.ash");
    });

    test("v1 manifest without entrypoint still fails", () => {
      const yaml = `
specVersion: 1
id: test
name: Test
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });
  });

  // =========================================================================
  // Security
  // =========================================================================
  describe("Security", () => {
    test("v2 entrypoint path traversal is rejected", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
entrypoint: ../../etc/passwd
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/traversal/i);
    });
  });
});
