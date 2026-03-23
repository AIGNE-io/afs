import { describe, expect, test } from "bun:test";
import { parseURI } from "../../src/config/uri-parser.js";

describe("parseURI", () => {
  describe("fs:// scheme", () => {
    test("parses simple fs URI", () => {
      const result = parseURI("fs:///Users/rob/code");
      expect(result.scheme).toBe("fs");
      expect(result.body).toBe("/Users/rob/code");
      expect(result.query).toEqual({});
    });

    test("parses fs URI with spaces in path (encoded)", () => {
      const result = parseURI("fs:///Users/rob/my%20projects");
      expect(result.body).toBe("/Users/rob/my%20projects");
    });
  });

  describe("git:// scheme", () => {
    test("parses git URI with branch param", () => {
      const result = parseURI("git:///path/to/repo?branch=main");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("/path/to/repo");
      expect(result.query).toEqual({ branch: "main" });
    });

    test("parses git URI with multiple params", () => {
      const result = parseURI("git:///repo?branch=develop&depth=1");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("/repo");
      expect(result.query).toEqual({ branch: "develop", depth: "1" });
    });

    test("parses git URI without params", () => {
      const result = parseURI("git:///path/to/repo");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("/path/to/repo");
      expect(result.query).toEqual({});
    });

    test("parses SSH-style git URL", () => {
      const result = parseURI("git@github.com:ArcBlock/teamflow-aigne.git");
      expect(result.scheme).toBe("git");
      expect(result.host).toBe("github.com");
      expect(result.body).toBe("ArcBlock/teamflow-aigne.git");
      expect(result.query).toEqual({});
    });

    test("parses SSH-style git URL with different host", () => {
      const result = parseURI("git@gitlab.com:user/project.git");
      expect(result.scheme).toBe("git");
      expect(result.host).toBe("gitlab.com");
      expect(result.body).toBe("user/project.git");
    });

    test("parses git:// with embedded SSH URL", () => {
      const result = parseURI("git://git@github.com:octocat/Hello-World.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("git@github.com:octocat/Hello-World.git");
    });

    test("parses git:// with embedded HTTPS URL", () => {
      const result = parseURI("git://https://github.com/octocat/Hello-World.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("https://github.com/octocat/Hello-World.git");
    });

    test("parses git:// with embedded HTTP URL", () => {
      const result = parseURI("git://http://git.example.com/repo.git");
      expect(result.scheme).toBe("git");
      expect(result.body).toBe("http://git.example.com/repo.git");
    });
  });

  describe("sqlite:// scheme", () => {
    test("parses sqlite URI", () => {
      const result = parseURI("sqlite:///path/to/app.db");
      expect(result.scheme).toBe("sqlite");
      expect(result.body).toBe("/path/to/app.db");
    });
  });

  describe("json:// scheme", () => {
    test("parses json URI", () => {
      const result = parseURI("json:///path/to/config.json");
      expect(result.scheme).toBe("json");
      expect(result.body).toBe("/path/to/config.json");
    });

    test("parses yaml file via json scheme", () => {
      const result = parseURI("json:///config.yaml");
      expect(result.scheme).toBe("json");
      expect(result.body).toBe("/config.yaml");
    });
  });

  describe("http:// and https:// schemes", () => {
    test("parses https URI", () => {
      const result = parseURI("https://afs.example.com/api");
      expect(result.scheme).toBe("https");
      expect(result.body).toBe("afs.example.com/api");
    });

    test("parses https URI with port", () => {
      const result = parseURI("https://afs.example.com:8443/api");
      expect(result.scheme).toBe("https");
      expect(result.body).toBe("afs.example.com:8443/api");
    });

    test("parses http URI", () => {
      const result = parseURI("http://localhost:3000/docs");
      expect(result.scheme).toBe("http");
      expect(result.body).toBe("localhost:3000/docs");
    });

    test("parses https URI with query params", () => {
      const result = parseURI("https://afs.example.com/api?token=abc");
      expect(result.scheme).toBe("https");
      expect(result.query).toEqual({ token: "abc" });
    });
  });

  describe("mcp:// schemes", () => {
    test("parses mcp:// URI with name", () => {
      const result = parseURI("mcp://sqlite");
      expect(result.scheme).toBe("mcp");
      expect(result.body).toBe("sqlite");
    });

    test("parses mcp+stdio:// URI with args query params", () => {
      const result = parseURI(
        "mcp+stdio://npx?args=-y&args=@modelcontextprotocol/server-sqlite&args=test.db",
      );
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("npx");
    });

    test("parses mcp+http:// URI", () => {
      const result = parseURI("mcp+http://mcp.notion.com/mcp");
      expect(result.scheme).toBe("mcp+http");
      expect(result.body).toBe("mcp.notion.com/mcp");
    });

    test("parses mcp+sse:// URI", () => {
      const result = parseURI("mcp+sse://api.example.com/sse");
      expect(result.scheme).toBe("mcp+sse");
      expect(result.body).toBe("api.example.com/sse");
    });

    test("parses mcp:// URI with query params", () => {
      const result = parseURI("mcp://server?transport=stdio&timeout=5000");
      expect(result.scheme).toBe("mcp");
      expect(result.body).toBe("server");
      expect(result.query).toEqual({ transport: "stdio", timeout: "5000" });
    });

    test("parses mcp+stdio with scoped package args", () => {
      const result = parseURI("mcp+stdio://npx?args=-y&args=@playwright/mcp");
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("npx");
    });

    test("parses mcp+stdio with absolute path command", () => {
      const result = parseURI("mcp+stdio:///usr/local/bin/my-server");
      expect(result.scheme).toBe("mcp+stdio");
      expect(result.body).toBe("/usr/local/bin/my-server");
    });
  });

  describe("error handling", () => {
    test("throws on unknown scheme (now accepted — no hardcoded scheme list)", () => {
      // New behavior: parseURI accepts any scheme
      const result = parseURI("ftp:///path");
      expect(result.scheme).toBe("ftp");
      expect(result.body).toBe("/path");
    });

    test("throws on invalid URI format", () => {
      expect(() => parseURI("not-a-uri")).toThrow();
    });

    test("throws on empty URI", () => {
      expect(() => parseURI("")).toThrow();
    });
  });

  describe("edge cases", () => {
    test("handles URI with empty body", () => {
      const result = parseURI("https://afs.example.com");
      expect(result.scheme).toBe("https");
      expect(result.body).toBe("afs.example.com");
    });

    test("handles special characters in path", () => {
      const result = parseURI("fs:///path/to/file%23name.txt");
      expect(result.body).toBe("/path/to/file%23name.txt");
    });
  });
});
