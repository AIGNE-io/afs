import { describe, expect, test } from "bun:test";
import { parseBlockletManifest } from "@aigne/afs";

describe("parseBlockletManifest — sites field (T2-0)", () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    test("parses v2 manifest with single site", () => {
      const yaml = `
specVersion: 2
id: showcase
name: AUP Showcase
sites:
  - name: showcase
    domain: showcase.aigne.io
    port: 3100
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.sites).toHaveLength(1);
      expect(manifest.sites![0]).toEqual({
        name: "showcase",
        domain: "showcase.aigne.io",
        port: 3100,
      });
    });

    test("parses v2 manifest with multiple sites", () => {
      const yaml = `
specVersion: 2
id: my-product
name: My Product
sites:
  - name: marketing
    domain: myproduct.com
    port: 3200
  - name: docs
    domain: docs.myproduct.com
    port: 3201
  - name: app
    domain: app.myproduct.com
    port: 3202
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.sites).toHaveLength(3);
      expect(manifest.sites![0]!.name).toBe("marketing");
      expect(manifest.sites![1]!.name).toBe("docs");
      expect(manifest.sites![2]!.name).toBe("app");
    });

    test("parses site with aliases", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: main
    domain: example.com
    port: 3100
    aliases:
      - www.example.com
      - old.example.com
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.sites![0]!.aliases).toEqual(["www.example.com", "old.example.com"]);
    });

    test("parses site with minimal fields (name only)", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: dev-site
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.sites![0]).toEqual({ name: "dev-site" });
      expect(manifest.sites![0]!.domain).toBeUndefined();
      expect(manifest.sites![0]!.port).toBeUndefined();
    });
  });

  // =========================================================================
  // Backward Compatibility
  // =========================================================================
  describe("Backward Compatibility", () => {
    test("v2 without sites field parses with sites undefined", () => {
      const yaml = `
specVersion: 2
id: legacy
name: Legacy Blocklet
`;
      const manifest = parseBlockletManifest(yaml);
      expect(manifest.sites).toBeUndefined();
    });

    test("v1 manifest ignores sites field (v1 has no sites)", () => {
      const yaml = `
specVersion: 1
id: agent
name: Agent
entrypoint: scripts/chat.ash
`;
      const manifest = parseBlockletManifest(yaml);
      expect((manifest as any).sites).toBeUndefined();
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    test("duplicate site names throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: mysite
    port: 3100
  - name: mysite
    port: 3101
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/duplicate.*site.*name/i);
    });

    test("duplicate site ports throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: site-a
    port: 3100
  - name: site-b
    port: 3100
`;
      expect(() => parseBlockletManifest(yaml)).toThrow(/duplicate.*port/i);
    });

    test("site with empty name throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: ""
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("site with invalid port (negative) throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: mysite
    port: -1
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("site with invalid port (too large) throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: mysite
    port: 70000
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });

    test("site with invalid domain format throws validation error", () => {
      const yaml = `
specVersion: 2
id: test
name: Test
sites:
  - name: mysite
    domain: "not a valid domain!"
`;
      expect(() => parseBlockletManifest(yaml)).toThrow();
    });
  });
});
