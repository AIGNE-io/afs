import { describe, expect, test } from "bun:test";
import { AFSHttpClient } from "../src/client.js";
import { SSRFError, validateUrl } from "../src/url-validation.js";

describe("SSRF URL validation", () => {
  describe("validateUrl()", () => {
    describe("blocks private networks", () => {
      test("blocks 10.x.x.x", () => {
        expect(() => validateUrl("http://10.0.0.1/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://10.255.255.255/api")).toThrow(SSRFError);
      });

      test("blocks 172.16-31.x.x", () => {
        expect(() => validateUrl("http://172.16.0.1/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://172.31.255.255/api")).toThrow(SSRFError);
      });

      test("allows 172.15.x.x and 172.32.x.x (not private)", () => {
        expect(() => validateUrl("http://172.15.0.1/api")).not.toThrow();
        expect(() => validateUrl("http://172.32.0.1/api")).not.toThrow();
      });

      test("blocks 192.168.x.x", () => {
        expect(() => validateUrl("http://192.168.1.1/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://192.168.0.100/api")).toThrow(SSRFError);
      });

      test("blocks 169.254.x.x (link-local / AWS IMDS)", () => {
        expect(() => validateUrl("http://169.254.169.254/latest/meta-data/")).toThrow(SSRFError);
        expect(() => validateUrl("http://169.254.0.1/api")).toThrow(SSRFError);
      });
    });

    describe("blocks loopback", () => {
      test("blocks 127.0.0.1", () => {
        expect(() => validateUrl("http://127.0.0.1/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://127.0.0.1:6379/")).toThrow(SSRFError);
      });

      test("blocks 127.x.x.x range", () => {
        expect(() => validateUrl("http://127.1.1.1/api")).toThrow(SSRFError);
      });

      test("blocks localhost", () => {
        expect(() => validateUrl("http://localhost/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://localhost:3000/api")).toThrow(SSRFError);
      });

      test("blocks 0.0.0.0", () => {
        expect(() => validateUrl("http://0.0.0.0/api")).toThrow(SSRFError);
      });

      test("blocks IPv6 loopback ::1", () => {
        expect(() => validateUrl("http://[::1]/api")).toThrow(SSRFError);
      });
    });

    describe("blocks IPv6 private ranges", () => {
      test("blocks fe80:: link-local", () => {
        expect(() => validateUrl("http://[fe80::1]/api")).toThrow(SSRFError);
      });

      test("blocks fc00::/fd00:: unique local", () => {
        expect(() => validateUrl("http://[fc00::1]/api")).toThrow(SSRFError);
        expect(() => validateUrl("http://[fd12::1]/api")).toThrow(SSRFError);
      });
    });

    describe("blocks non-HTTP schemes", () => {
      test("blocks file://", () => {
        expect(() => validateUrl("file:///etc/passwd")).toThrow(SSRFError);
      });

      test("blocks ftp://", () => {
        expect(() => validateUrl("ftp://internal-server/data")).toThrow(SSRFError);
      });

      test("blocks gopher://", () => {
        expect(() => validateUrl("gopher://evil.com/")).toThrow(SSRFError);
      });

      test("blocks data:", () => {
        expect(() => validateUrl("data:text/plain,hello")).toThrow(SSRFError);
      });
    });

    describe("allows public URLs", () => {
      test("allows https://example.com", () => {
        expect(() => validateUrl("https://example.com/api")).not.toThrow();
      });

      test("allows https://api.github.com", () => {
        expect(() => validateUrl("https://api.github.com/repos")).not.toThrow();
      });

      test("allows http with public domain", () => {
        expect(() => validateUrl("http://public-server.example.com/afs/rpc")).not.toThrow();
      });
    });

    describe("allowPrivateNetwork opt-out", () => {
      test("allows localhost when allowPrivateNetwork is true", () => {
        expect(() => validateUrl("http://localhost:3000/api", true)).not.toThrow();
      });

      test("allows 127.0.0.1 when allowPrivateNetwork is true", () => {
        expect(() => validateUrl("http://127.0.0.1/api", true)).not.toThrow();
      });

      test("allows 192.168.x.x when allowPrivateNetwork is true", () => {
        expect(() => validateUrl("http://192.168.1.1/api", true)).not.toThrow();
      });

      test("still blocks non-HTTP schemes even with allowPrivateNetwork", () => {
        expect(() => validateUrl("file:///etc/passwd", true)).toThrow(SSRFError);
      });
    });

    describe("invalid URLs", () => {
      test("blocks invalid URL format", () => {
        expect(() => validateUrl("not-a-url")).toThrow(SSRFError);
      });
    });
  });

  describe("AFSHttpClient integration", () => {
    test("rejects construction with private IP", () => {
      expect(
        () =>
          new AFSHttpClient({
            url: "http://169.254.169.254/latest/meta-data/",
            name: "imds",
          }),
      ).toThrow("SSRF");
    });

    test("rejects construction with localhost", () => {
      expect(
        () =>
          new AFSHttpClient({
            url: "http://localhost:6379/",
            name: "redis",
          }),
      ).toThrow("SSRF");
    });

    test("allows construction with allowPrivateNetwork", () => {
      expect(
        () =>
          new AFSHttpClient({
            url: "http://localhost:3000/afs",
            name: "local",
            allowPrivateNetwork: true,
          }),
      ).not.toThrow();
    });

    test("allows construction with public URL", () => {
      expect(
        () =>
          new AFSHttpClient({
            url: "https://api.example.com/afs",
            name: "remote",
          }),
      ).not.toThrow();
    });
  });
});
