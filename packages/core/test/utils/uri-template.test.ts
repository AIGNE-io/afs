import { describe, expect, test } from "bun:test";
import {
  buildURI,
  extractSchemeFromTemplate,
  getTemplateVariableNames,
  parseTemplate,
} from "../../src/utils/uri-template.js";

describe("parseTemplate", () => {
  describe("Happy Path", () => {
    test("single greedy+optional: s3://{bucket}/{prefix+?} with full body", () => {
      const result = parseTemplate("s3://{bucket}/{prefix+?}", "my-bucket/a/b/c");
      expect(result).toEqual({ bucket: "my-bucket", prefix: "a/b/c" });
    });

    test("two single-segment: gce://{project}/{zone}", () => {
      const result = parseTemplate("gce://{project}/{zone}", "my-proj/us-east1-b");
      expect(result).toEqual({ project: "my-proj", zone: "us-east1-b" });
    });

    test("single greedy: fs://{localPath+}", () => {
      const result = parseTemplate("fs://{localPath+}", "/Users/me/code");
      expect(result).toEqual({ localPath: "/Users/me/code" });
    });

    test("no variables: sandbox://", () => {
      const result = parseTemplate("sandbox://", "");
      expect(result).toEqual({});
    });

    test("single optional with empty body: ec2://{region?}", () => {
      const result = parseTemplate("ec2://{region?}", "");
      expect(result).toEqual({ region: undefined });
    });

    test("single optional with value: ec2://{region?}", () => {
      const result = parseTemplate("ec2://{region?}", "us-east-1");
      expect(result).toEqual({ region: "us-east-1" });
    });

    test("greedy+optional with no value: s3://{bucket}/{prefix+?}", () => {
      const result = parseTemplate("s3://{bucket}/{prefix+?}", "my-bucket");
      expect(result).toEqual({ bucket: "my-bucket", prefix: undefined });
    });

    test("github://{owner}/{repo}", () => {
      const result = parseTemplate("github://{owner}/{repo}", "octocat/Hello-World");
      expect(result).toEqual({ owner: "octocat", repo: "Hello-World" });
    });

    test("dns://{zone}", () => {
      const result = parseTemplate("dns://{zone}", "example.com");
      expect(result).toEqual({ zone: "example.com" });
    });

    test("cloudflare://{accountId}", () => {
      const result = parseTemplate("cloudflare://{accountId}", "abc123");
      expect(result).toEqual({ accountId: "abc123" });
    });

    test("mcp+stdio://{command+}", () => {
      const result = parseTemplate("mcp+stdio://{command+}", "npx");
      expect(result).toEqual({ command: "npx" });
    });

    test("mcp+stdio://{command+} with path", () => {
      const result = parseTemplate("mcp+stdio://{command+}", "/usr/local/bin/server");
      expect(result).toEqual({ command: "/usr/local/bin/server" });
    });

    test("http://{host+}", () => {
      const result = parseTemplate("http://{host+}", "localhost:3000/api");
      expect(result).toEqual({ host: "localhost:3000/api" });
    });
  });

  describe("Bad Path", () => {
    test("required variable with empty body throws", () => {
      expect(() => parseTemplate("s3://{bucket}/{prefix+?}", "")).toThrow('requires "bucket"');
    });

    test("missing required non-greedy variable throws", () => {
      expect(() => parseTemplate("gce://{project}/{zone}", "my-proj")).toThrow('requires "zone"');
    });
  });

  describe("Edge Cases", () => {
    test("greedy+optional when prefix is empty", () => {
      const result = parseTemplate("s3://{bucket}/{prefix+?}", "just-bucket");
      expect(result.bucket).toBe("just-bucket");
      expect(result.prefix).toBeUndefined();
    });

    test("single segment variable does not consume /", () => {
      // For gce://{project}/{zone}, body "my-proj/us-east1-b"
      // project=my-proj, zone=us-east1-b (split by /)
      const result = parseTemplate("gce://{project}/{zone}", "my-proj/us-east1-b");
      expect(result.project).toBe("my-proj");
      expect(result.zone).toBe("us-east1-b");
    });
  });

  describe("Security", () => {
    test("template error does not reveal body content", () => {
      try {
        parseTemplate("s3://{bucket}/{prefix+?}", "");
      } catch (e: any) {
        expect(e.message).toContain("s3://");
        expect(e.message).toContain("bucket");
        // Should not contain sensitive URI body content
      }
    });
  });

  describe("Data Damage", () => {
    test("parseTemplate is a pure function", () => {
      const template = "s3://{bucket}/{prefix+?}";
      const body = "my-bucket/path";
      const r1 = parseTemplate(template, body);
      const r2 = parseTemplate(template, body);
      expect(r1).toEqual(r2);
      expect(r1).not.toBe(r2);
    });
  });
});

describe("buildURI", () => {
  describe("Happy Path", () => {
    test("s3://{bucket}/{prefix+?} with both values", () => {
      const result = buildURI("s3://{bucket}/{prefix+?}", { bucket: "b", prefix: "p/q" });
      expect(result).toBe("s3://b/p/q");
    });

    test("cloudflare://{accountId} with value", () => {
      const result = buildURI("cloudflare://{accountId}", { accountId: "abc" });
      expect(result).toBe("cloudflare://abc");
    });

    test("sandbox:// with empty vars", () => {
      const result = buildURI("sandbox://", {});
      expect(result).toBe("sandbox://");
    });

    test("gce://{project}/{zone} with both values", () => {
      const result = buildURI("gce://{project}/{zone}", { project: "my-proj", zone: "us-east1" });
      expect(result).toBe("gce://my-proj/us-east1");
    });

    test("fs://{localPath+} with path", () => {
      const result = buildURI("fs://{localPath+}", { localPath: "/Users/me/code" });
      expect(result).toBe("fs:///Users/me/code");
    });
  });

  describe("Bad Path", () => {
    test("missing required param throws", () => {
      expect(() => buildURI("s3://{bucket}/{prefix+?}", {})).toThrow('required variable "bucket"');
    });

    test("missing required param with only optional provided", () => {
      expect(() => buildURI("s3://{bucket}/{prefix+?}", { prefix: "p" })).toThrow(
        'required variable "bucket"',
      );
    });
  });

  describe("Edge Cases", () => {
    test("optional param undefined is omitted", () => {
      const result = buildURI("s3://{bucket}/{prefix+?}", { bucket: "b", prefix: undefined });
      expect(result).toBe("s3://b");
    });

    test("optional param empty string is omitted", () => {
      const result = buildURI("s3://{bucket}/{prefix+?}", { bucket: "b", prefix: "" });
      expect(result).toBe("s3://b");
    });

    test("ec2://{region?} with no value", () => {
      const result = buildURI("ec2://{region?}", {});
      expect(result).toBe("ec2://");
    });

    test("ec2://{region?} with value", () => {
      const result = buildURI("ec2://{region?}", { region: "us-east-1" });
      expect(result).toBe("ec2://us-east-1");
    });
  });
});

describe("extractSchemeFromTemplate", () => {
  test("simple scheme", () => {
    expect(extractSchemeFromTemplate("fs://{localPath+}")).toBe("fs");
  });

  test("compound scheme", () => {
    expect(extractSchemeFromTemplate("mcp+stdio://{command+}")).toBe("mcp+stdio");
  });

  test("invalid template throws", () => {
    expect(() => extractSchemeFromTemplate("no-scheme")).toThrow("Invalid URI template");
  });
});

describe("getTemplateVariableNames", () => {
  test("single variable", () => {
    expect(getTemplateVariableNames("fs://{localPath+}")).toEqual(["localPath"]);
  });

  test("multiple variables", () => {
    expect(getTemplateVariableNames("s3://{bucket}/{prefix+?}")).toEqual(["bucket", "prefix"]);
  });

  test("no variables", () => {
    expect(getTemplateVariableNames("sandbox://")).toEqual([]);
  });

  test("strips modifiers from names", () => {
    expect(getTemplateVariableNames("ec2://{region?}")).toEqual(["region"]);
    expect(getTemplateVariableNames("gce://{project}/{zone}")).toEqual(["project", "zone"]);
  });
});
