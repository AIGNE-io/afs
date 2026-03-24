import { describe, expect, test } from "bun:test";
import { parseURI } from "../../src/utils/uri.js";

describe("parseURI", () => {
  describe("Happy Path", () => {
    test('parseURI("fs:///path/to/dir") → { scheme: "fs", body: "/path/to/dir", query: {} }', () => {
      const result = parseURI("fs:///path/to/dir");
      expect(result.scheme).toBe("fs");
      expect(result.body).toBe("/path/to/dir");
      expect(result.query).toEqual({});
    });

    test('parseURI("s3://my-bucket/prefix") → { scheme: "s3", body: "my-bucket/prefix", query: {} }', () => {
      const result = parseURI("s3://my-bucket/prefix");
      expect(result.scheme).toBe("s3");
      expect(result.body).toBe("my-bucket/prefix");
      expect(result.query).toEqual({});
    });

    test('parseURI("ec2://?profile=prod") → { scheme: "ec2", body: "", query: { profile: "prod" } }', () => {
      const result = parseURI("ec2://?profile=prod");
      expect(result.scheme).toBe("ec2");
      expect(result.body).toBe("");
      expect(result.query).toEqual({ profile: "prod" });
    });

    test('parseURI("sandbox://") → { scheme: "sandbox", body: "", query: {} }', () => {
      const result = parseURI("sandbox://");
      expect(result.scheme).toBe("sandbox");
      expect(result.body).toBe("");
      expect(result.query).toEqual({});
    });

    test('parseURI("mcp+stdio://npx?args=foo") → { scheme: "mcp+stdio", body: "npx", query: { args: "foo" } }', () => {
      const result = parseURI("mcp+stdio://npx?args=foo");
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("npx");
      expect(result.query).toEqual({ args: "foo" });
    });

    test('parseURI("gcs://bucket/prefix?projectId=x") → { scheme: "gcs", body: "bucket/prefix", query: { projectId: "x" } }', () => {
      const result = parseURI("gcs://bucket/prefix?projectId=x");
      expect(result.scheme).toBe("gcs");
      expect(result.body).toBe("bucket/prefix");
      expect(result.query).toEqual({ projectId: "x" });
    });

    test('parseURI("cloudflare://abc123") → { scheme: "cloudflare", body: "abc123", query: {} }', () => {
      const result = parseURI("cloudflare://abc123");
      expect(result.scheme).toBe("cloudflare");
      expect(result.body).toBe("abc123");
      expect(result.query).toEqual({});
    });

    test("parseURI SSH-style git URL → { scheme: 'git', body: 'user/repo.git', host: 'github.com' }", () => {
      const result = parseURI("git@github.com:user/repo.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("user/repo.git");
      expect(result.query).toEqual({});
      expect(result.host).toBe("github.com");
    });

    test("parses git:// with branch param", () => {
      const result = parseURI("git:///path/to/repo?branch=main");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("/path/to/repo");
      expect(result.query).toEqual({ branch: "main" });
    });

    test("parses workspace:// URI", () => {
      const result = parseURI("workspace:///path/to/workspace");
      expect(result.scheme).toBe("workspace");
      expect(result.body).toBe("/path/to/workspace");
      expect(result.query).toEqual({});
    });

    test("parses workspace:// with relative path", () => {
      const result = parseURI("workspace://./my-workspace");
      expect(result.scheme).toBe("workspace");
      expect(result.body).toBe("./my-workspace");
    });

    test("parses http:// URI", () => {
      const result = parseURI("http://localhost:3000/docs");
      expect(result.scheme).toBe("http");
      expect(result.body).toBe("localhost:3000/docs");
      expect(result.query).toEqual({});
    });

    test("parses https:// URI with query", () => {
      const result = parseURI("https://afs.example.com/api?token=abc");
      expect(result.scheme).toBe("https");
      expect(result.body).toBe("afs.example.com/api");
      expect(result.query).toEqual({ token: "abc" });
    });

    test("parses mcp+stdio with absolute path command", () => {
      const result = parseURI("mcp+stdio:///path/to/binary");
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("/path/to/binary");
    });

    test("parses mcp+http:// URI", () => {
      const result = parseURI("mcp+http://mcp.notion.com/mcp");
      expect(result.scheme).toBe("mcp+http");
      expect(result.body).toBe("mcp.notion.com/mcp");
    });

    test("parses sqlite:// URI", () => {
      const result = parseURI("sqlite:///path/to/db.sqlite");
      expect(result.scheme).toBe("sqlite");
      expect(result.body).toBe("/path/to/db.sqlite");
    });

    test("parses json:// URI", () => {
      const result = parseURI("json:///path/to/config.json");
      expect(result.scheme).toBe("json");
      expect(result.body).toBe("/path/to/config.json");
    });

    test("parses github:// URI", () => {
      const result = parseURI("github://owner/repo");
      expect(result.scheme).toBe("github");
      expect(result.body).toBe("owner/repo");
    });

    test("parses dns:// URI", () => {
      const result = parseURI("dns://example.com");
      expect(result.scheme).toBe("dns");
      expect(result.body).toBe("example.com");
    });

    test("parses gce:// URI", () => {
      const result = parseURI("gce://my-project/us-east1-b");
      expect(result.scheme).toBe("gce");
      expect(result.body).toBe("my-project/us-east1-b");
    });
  });

  describe("Bad Path", () => {
    test('parseURI("") throws "URI cannot be empty"', () => {
      expect(() => parseURI("")).toThrow("URI cannot be empty");
    });

    test('parseURI("noscheme") throws "Invalid URI format"', () => {
      expect(() => parseURI("noscheme")).toThrow("Invalid URI format");
    });

    test('parseURI("://missing-scheme") throws "Invalid URI format"', () => {
      expect(() => parseURI("://missing-scheme")).toThrow("Invalid URI format");
    });

    test("throws on whitespace-only URI", () => {
      expect(() => parseURI("   ")).toThrow("URI cannot be empty");
    });
  });

  describe("Edge Cases", () => {
    test("accepts any unknown scheme (not hardcoded)", () => {
      const result = parseURI("notion://workspace");
      expect(result.scheme).toBe("notion");
      expect(result.body).toBe("workspace");
      expect(result.query).toEqual({});
    });

    test("scheme is case-insensitive", () => {
      const result = parseURI("FS:///path");
      expect(result.scheme).toBe("fs");
      expect(result.body).toBe("/path");
    });

    test("handles body with special characters (spaces encoded)", () => {
      const result = parseURI("fs:///path/to/my%20file");
      expect(result.body).toBe("/path/to/my%20file");
    });

    test("handles multiple query parameters", () => {
      const result = parseURI("s3://bucket?region=us&endpoint=http://localhost");
      expect(result.scheme).toBe("s3");
      expect(result.body).toBe("bucket");
      expect(result.query).toEqual({ region: "us", endpoint: "http://localhost" });
    });

    test("handles URI with only query, no body", () => {
      const result = parseURI("ec2://?profile=prod&region=us-east-1");
      expect(result.body).toBe("");
      expect(result.query).toEqual({ profile: "prod", region: "us-east-1" });
    });

    test("handles compound scheme with dots: custom.v2://", () => {
      const result = parseURI("custom.v2://body");
      expect(result.scheme).toBe("custom.v2");
      expect(result.body).toBe("body");
    });

    test("handles trailing slash in body", () => {
      const result = parseURI("workspace:///tmp/workspace/");
      expect(result.body).toBe("/tmp/workspace/");
    });

    test("git:// with embedded HTTPS URL in body", () => {
      const result = parseURI("git://https://github.com/octocat/Hello-World.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("https://github.com/octocat/Hello-World.git");
    });

    test("mcp+stdio with repeated args in query (multi-valued)", () => {
      const result = parseURI("mcp+stdio://npx?args=-y&args=@playwright/mcp");
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("npx");
      // Multi-valued query params become arrays
      expect(result.query.args).toEqual(["-y", "@playwright/mcp"]);
    });

    test("parses git:// with embedded SSH URL in body", () => {
      const result = parseURI("git://git@github.com:octocat/Hello-World.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("git@github.com:octocat/Hello-World.git");
    });
  });

  describe("Security", () => {
    test("does not interpret body contents (opaque passthrough)", () => {
      // Body with what looks like credentials — parser should not try to parse them
      const result = parseURI("custom://user:pass@host/path");
      expect(result.body).toBe("user:pass@host/path");
    });

    test("handles body with path traversal without special treatment", () => {
      const result = parseURI("fs://../../etc/passwd");
      expect(result.body).toBe("../../etc/passwd");
    });
  });

  describe("Data Leak", () => {
    test("error message does not include full URI (may contain tokens)", () => {
      try {
        parseURI("not-a-valid-uri");
      } catch (e: any) {
        expect(e.message).not.toContain("not-a-valid-uri");
        expect(e.message).toContain("Invalid URI format");
      }
    });
  });

  describe("Data Damage", () => {
    test("parseURI is a pure function (does not modify input)", () => {
      const uri = "fs:///test?key=value";
      const result1 = parseURI(uri);
      const result2 = parseURI(uri);
      expect(result1).toEqual(result2);
      // Objects should be separate instances
      expect(result1).not.toBe(result2);
      expect(result1.query).not.toBe(result2.query);
    });
  });
});
