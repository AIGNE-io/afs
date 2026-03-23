/**
 * CapabilityEnforcer tests — audit and enforce levels.
 */
import { describe, expect, test } from "bun:test";
import {
  CapabilityEnforcer,
  type CapabilityEvent,
  createScopedAFSProxy,
} from "../src/capability-enforcer.js";
import type { ProviderCapabilityManifest } from "../src/type.js";

/** Collect audit events into an array */
function collectEvents(): { events: CapabilityEvent[]; handler: (e: CapabilityEvent) => void } {
  const events: CapabilityEvent[] = [];
  return { events, handler: (e) => events.push(e) };
}

describe("CapabilityEnforcer", () => {
  describe("construction", () => {
    test("creates with default level 'none'", () => {
      const enforcer = new CapabilityEnforcer();
      expect(enforcer.level).toBe("none");
    });

    test("creates with explicit level", () => {
      const enforcer = new CapabilityEnforcer({ level: "audit" });
      expect(enforcer.level).toBe("audit");
    });
  });

  describe("level=none", () => {
    test("always allows, no events", () => {
      const { events, handler } = collectEvents();
      const enforcer = new CapabilityEnforcer({ level: "none", onEvent: handler });
      const manifest: ProviderCapabilityManifest = {};

      const result = enforcer.check("test-provider", manifest, "crossProvider", {
        op: "read",
        path: "/modules/other/data",
      });

      expect(result.allowed).toBe(true);
      expect(events).toHaveLength(0);
    });
  });

  describe("level=audit", () => {
    test("allows declared capability and logs event", () => {
      const { events, handler } = collectEvents();
      const enforcer = new CapabilityEnforcer({ level: "audit", onEvent: handler });
      const manifest: ProviderCapabilityManifest = {
        crossProvider: { afsAccess: true },
      };

      const result = enforcer.check("ash", manifest, "crossProvider", {
        op: "read",
        path: "/modules/fs/file.txt",
      });

      expect(result.allowed).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("capability-use");
      expect(events[0]!.provider).toBe("ash");
      expect(events[0]!.capability).toBe("crossProvider");
    });

    test("allows undeclared capability but logs violation", () => {
      const { events, handler } = collectEvents();
      const enforcer = new CapabilityEnforcer({ level: "audit", onEvent: handler });
      const manifest: ProviderCapabilityManifest = {}; // no crossProvider declared

      const result = enforcer.check("sneaky-provider", manifest, "crossProvider", {
        op: "read",
        path: "/modules/vault/secrets",
      });

      expect(result.allowed).toBe(true); // audit = allow
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("capability-violation");
      expect(events[0]!.provider).toBe("sneaky-provider");
    });

    test("logs network egress check", () => {
      const { events, handler } = collectEvents();
      const enforcer = new CapabilityEnforcer({ level: "audit", onEvent: handler });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["api.github.com"] },
      };

      const result = enforcer.check("github", manifest, "network", {
        domain: "api.github.com",
      });

      expect(result.allowed).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("capability-use");
    });

    test("logs domain violation in audit mode but allows", () => {
      const { events, handler } = collectEvents();
      const enforcer = new CapabilityEnforcer({ level: "audit", onEvent: handler });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["api.github.com"] },
      };

      const result = enforcer.check("github", manifest, "network", {
        domain: "evil.com",
      });

      expect(result.allowed).toBe(true); // audit = allow
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("capability-violation");
    });
  });

  describe("level=enforce", () => {
    test("allows declared capability", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        crossProvider: { afsAccess: true },
      };

      const result = enforcer.check("ash", manifest, "crossProvider", {
        op: "read",
        path: "/modules/fs/data",
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks undeclared crossProvider access", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {}; // no crossProvider

      const result = enforcer.check("sneaky", manifest, "crossProvider", {
        op: "read",
        path: "/modules/vault/secrets",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not declared");
    });

    test("blocks network to undeclared domain", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["api.github.com"] },
      };

      const result = enforcer.check("github", manifest, "network", {
        domain: "evil.com",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("evil.com");
    });

    test("allows network to declared domain", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["api.github.com"] },
      };

      const result = enforcer.check("github", manifest, "network", {
        domain: "api.github.com",
      });

      expect(result.allowed).toBe(true);
    });

    test("allows wildcard domain match", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["*.amazonaws.com"] },
      };

      const result = enforcer.check("s3", manifest, "network", {
        domain: "s3.us-east-1.amazonaws.com",
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks network when no egress declared", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {}; // no network

      const result = enforcer.check("local-only", manifest, "network", {
        domain: "example.com",
      });

      expect(result.allowed).toBe(false);
    });

    test("blocks process spawn when not declared", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {};

      const result = enforcer.check("no-spawn", manifest, "process", {
        command: "rm",
      });

      expect(result.allowed).toBe(false);
    });

    test("allows declared process spawn", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        process: { spawn: true, allowedCommands: ["git"] },
      };

      const result = enforcer.check("git", manifest, "process", {
        command: "git",
      });

      expect(result.allowed).toBe(true);
    });

    test("blocks undeclared command even when spawn is allowed", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        process: { spawn: true, allowedCommands: ["git"] },
      };

      const result = enforcer.check("git", manifest, "process", {
        command: "rm",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("rm");
    });

    test("respects crossProvider readPaths restriction", () => {
      const enforcer = new CapabilityEnforcer({ level: "enforce" });
      const manifest: ProviderCapabilityManifest = {
        crossProvider: { afsAccess: true, readPaths: ["/modules/vault/*"] },
      };

      // Allowed path
      const ok = enforcer.check("scoped", manifest, "crossProvider", {
        op: "read",
        path: "/modules/vault/secret",
      });
      expect(ok.allowed).toBe(true);

      // Blocked path
      const blocked = enforcer.check("scoped", manifest, "crossProvider", {
        op: "read",
        path: "/modules/fs/private",
      });
      expect(blocked.allowed).toBe(false);
    });
  });

  describe("user deniedCapabilities", () => {
    test("deniedCapabilities always wins over manifest", () => {
      const enforcer = new CapabilityEnforcer({
        level: "enforce",
        deniedCapabilities: {
          network: { egress: true },
        },
      });
      const manifest: ProviderCapabilityManifest = {
        network: { egress: true, allowedDomains: ["api.github.com"] },
      };

      const result = enforcer.check("github", manifest, "network", {
        domain: "api.github.com",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("denied");
    });
  });

  describe("user grantedCapabilities", () => {
    test("grantedCapabilities expands manifest", () => {
      const enforcer = new CapabilityEnforcer({
        level: "enforce",
        grantedCapabilities: {
          crossProvider: { afsAccess: true },
        },
      });
      const manifest: ProviderCapabilityManifest = {}; // no crossProvider

      const result = enforcer.check("extended", manifest, "crossProvider", {
        op: "read",
        path: "/modules/any",
      });

      expect(result.allowed).toBe(true);
    });

    test("deniedCapabilities wins over grantedCapabilities", () => {
      const enforcer = new CapabilityEnforcer({
        level: "enforce",
        grantedCapabilities: {
          network: { egress: true },
        },
        deniedCapabilities: {
          network: { egress: true },
        },
      });
      const manifest: ProviderCapabilityManifest = {};

      const result = enforcer.check("conflicted", manifest, "network", {
        domain: "example.com",
      });

      expect(result.allowed).toBe(false);
    });
  });
});

describe("createScopedAFSProxy", () => {
  /** Minimal mock AFSRoot for testing */
  function createMockAFS() {
    const calls: { op: string; path: string }[] = [];
    return {
      calls,
      afs: {
        name: "AFSRoot",
        async read(path: string) {
          calls.push({ op: "read", path });
          return { data: { id: "mock", path, content: "test" } };
        },
        async list(path: string) {
          calls.push({ op: "list", path });
          return { data: [] };
        },
        async search(path: string, _query: string) {
          calls.push({ op: "search", path });
          return { data: [] };
        },
        async exec(path: string, _args: Record<string, unknown>) {
          calls.push({ op: "exec", path });
          return { success: true };
        },
        async initializePhysicalPath() {
          return "/tmp/mock";
        },
        async cleanupPhysicalPath() {},
      },
    };
  }

  test("audit level logs but allows all access", async () => {
    const { events, handler } = collectEvents();
    const enforcer = new CapabilityEnforcer({ level: "audit", onEvent: handler });
    const manifest: ProviderCapabilityManifest = {};
    const { afs, calls } = createMockAFS();

    const proxy = createScopedAFSProxy(afs as any, manifest, enforcer, "test-provider");

    await proxy.read!("/modules/other/data");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.op).toBe("read");
    expect(events.length).toBeGreaterThan(0);
  });

  test("enforce level blocks undeclared cross-provider read", () => {
    const enforcer = new CapabilityEnforcer({ level: "enforce" });
    const manifest: ProviderCapabilityManifest = {}; // no crossProvider
    const { afs } = createMockAFS();

    const proxy = createScopedAFSProxy(afs as any, manifest, enforcer, "blocked-provider");

    expect(() => proxy.read!("/modules/vault/secret")).toThrow("Capability violation");
  });

  test("enforce level allows declared cross-provider read", async () => {
    const enforcer = new CapabilityEnforcer({ level: "enforce" });
    const manifest: ProviderCapabilityManifest = {
      crossProvider: { afsAccess: true },
    };
    const { afs, calls } = createMockAFS();

    const proxy = createScopedAFSProxy(afs as any, manifest, enforcer, "ash");

    await proxy.read!("/modules/fs/data");
    expect(calls).toHaveLength(1);
  });

  test("proxy preserves non-intercepted properties", () => {
    const enforcer = new CapabilityEnforcer({ level: "audit" });
    const manifest: ProviderCapabilityManifest = {};
    const { afs } = createMockAFS();

    const proxy = createScopedAFSProxy(afs as any, manifest, enforcer, "test");

    expect(proxy.name).toBe("AFSRoot");
  });
});
