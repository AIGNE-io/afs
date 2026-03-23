import { describe, expect, test } from "bun:test";
import { parseRouteConfig, serializeRouteConfig } from "../../src/blocklet/route-config.js";

describe("Route Config (T2-1)", () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("parseRouteConfig", () => {
    test("parses web handler route", () => {
      const yaml = `site: showcase\npath: /blog\nsource: ./content/blog\nhandler: web`;
      const route = parseRouteConfig(yaml);
      expect(route).toEqual({
        site: "showcase",
        path: "/blog",
        source: "./content/blog",
        handler: "web",
      });
    });

    test("parses aup handler route", () => {
      const yaml = `site: showcase\npath: /app\nsource: .\nhandler: aup`;
      const route = parseRouteConfig(yaml);
      expect(route.handler).toBe("aup");
    });

    test("parses exec handler route", () => {
      const yaml = `site: showcase\npath: /api\nsource: .\nhandler: exec`;
      const route = parseRouteConfig(yaml);
      expect(route.handler).toBe("exec");
    });

    test("parses root path route", () => {
      const yaml = `site: showcase\npath: /\nsource: ./pages/home\nhandler: web`;
      const route = parseRouteConfig(yaml);
      expect(route.path).toBe("/");
    });
  });

  // =========================================================================
  // serializeRouteConfig
  // =========================================================================
  describe("serializeRouteConfig", () => {
    test("serializes route config to YAML", () => {
      const config = {
        site: "showcase",
        path: "/blog",
        source: "./content/blog",
        handler: "web" as const,
      };
      const yaml = serializeRouteConfig(config);
      const parsed = parseRouteConfig(yaml);
      expect(parsed).toEqual(config);
    });

    test("roundtrip preserves all fields", () => {
      const config = { site: "app", path: "/api", source: ".", handler: "exec" as const };
      const yaml = serializeRouteConfig(config);
      expect(parseRouteConfig(yaml)).toEqual(config);
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    test("invalid handler value throws", () => {
      const yaml = `site: showcase\npath: /blog\nsource: ./blog\nhandler: invalid`;
      expect(() => parseRouteConfig(yaml)).toThrow();
    });

    test("missing site field throws", () => {
      const yaml = `path: /blog\nsource: ./blog\nhandler: web`;
      expect(() => parseRouteConfig(yaml)).toThrow();
    });

    test("missing path field throws", () => {
      const yaml = `site: showcase\nsource: ./blog\nhandler: web`;
      expect(() => parseRouteConfig(yaml)).toThrow();
    });

    test("missing source field throws", () => {
      const yaml = `site: showcase\npath: /blog\nhandler: web`;
      expect(() => parseRouteConfig(yaml)).toThrow();
    });

    test("missing handler field throws", () => {
      const yaml = `site: showcase\npath: /blog\nsource: ./blog`;
      expect(() => parseRouteConfig(yaml)).toThrow();
    });

    test("empty string throws", () => {
      expect(() => parseRouteConfig("")).toThrow();
    });

    test("non-string input throws", () => {
      expect(() => parseRouteConfig(123 as any)).toThrow();
    });

    // M3 + L3: path traversal rejection
    test("path with .. traversal throws", () => {
      const yaml = `site: showcase\npath: /blog/../admin\nsource: ./blog\nhandler: web`;
      expect(() => parseRouteConfig(yaml)).toThrow(/traversal/i);
    });

    test("source with .. traversal throws", () => {
      const yaml = `site: showcase\npath: /blog\nsource: ../../secrets\nhandler: web`;
      expect(() => parseRouteConfig(yaml)).toThrow(/traversal/i);
    });
  });
});
