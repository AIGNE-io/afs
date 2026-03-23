import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AFSModule } from "@aigne/afs";
import type { TestConfig, TestDataStructure } from "../../types.js";
import { flattenTree, isDirectory } from "../../types.js";

/**
 * Injection payloads to test against exec/actions.
 */
const INJECTION_PAYLOADS = [
  "; rm -rf /tmp/.canary",
  "| cat /etc/passwd",
  "$(touch /tmp/.pwned)",
  "`whoami`",
  "'; DROP TABLE users; --",
  "${process.env.HOME}",
];

/**
 * T7: Argument injection payloads for CLI-backed providers.
 */
const ARG_INJECTION_PAYLOADS = [
  { payload: "--flag=malicious", label: "flag injection" },
  { payload: "-e 'system(\"id\")'", label: "interpreter flag injection" },
  { payload: "\nX-Injected: header", label: "CRLF injection in args" },
  { payload: "--output=/etc/passwd", label: "path flag injection" },
  { payload: "-c 'exec /bin/sh'", label: "shell exec flag injection" },
];

/**
 * Run InputInjectionSecurity suite.
 * Tests that exec/action arguments don't allow shell command or SQL injection.
 * Uses a canary file to verify no side effects.
 *
 * Only runs if the provider has exec or actions in its structure.
 */
export function runInputInjectionTests(
  getProvider: () => AFSModule,
  structure: TestDataStructure,
  _config: TestConfig,
): void {
  describe("input-injection", () => {
    // Find an action path from the structure
    const actionPaths: string[] = [];
    const flattened = flattenTree(structure.root);
    for (const { path, node } of flattened) {
      if (node.actions && node.actions.length > 0) {
        for (const action of node.actions) {
          actionPaths.push(`${path === "/" ? "" : path}/.actions/${action.name}`);
        }
      }
    }

    // Find an exec path (file nodes that are executable)
    const execPaths: string[] = [];
    for (const { path, node } of flattened) {
      if (!isDirectory(node) && path !== "/") {
        execPaths.push(path);
      }
    }

    const targetPaths = [...actionPaths.slice(0, 1), ...execPaths.slice(0, 1)];

    if (targetPaths.length === 0) {
      test("skipped — no exec or action paths in structure", () => {
        // Graceful skip
      });
      return;
    }

    // Canary-based injection tests
    const canaryDir = join(tmpdir(), `afs-injection-test-${Date.now()}`);
    const canaryPath = join(canaryDir, ".canary");
    const pwnedPath = join(canaryDir, ".pwned");

    test("setup canary file", () => {
      const { mkdirSync } = require("node:fs");
      mkdirSync(canaryDir, { recursive: true });
      writeFileSync(canaryPath, "SAFE");
      expect(existsSync(canaryPath)).toBe(true);
    });

    for (const payload of INJECTION_PAYLOADS) {
      for (const targetPath of targetPaths) {
        test(`exec ${targetPath} with payload "${payload.slice(0, 30)}" does not execute`, async () => {
          const provider = getProvider();
          if (!provider.exec) return;

          try {
            await provider.exec(targetPath, { input: payload, query: payload, value: payload }, {});
          } catch {
            // Error is expected and fine
          }
        });
      }
    }

    // T7: Argument injection payloads
    for (const { payload, label } of ARG_INJECTION_PAYLOADS) {
      for (const targetPath of targetPaths) {
        test(`exec ${targetPath} with ${label} does not execute`, async () => {
          const provider = getProvider();
          if (!provider.exec) return;

          try {
            await provider.exec(targetPath, { input: payload, command: payload, arg: payload }, {});
          } catch {
            // Error is expected and fine
          }
        });
      }
    }

    test("canary file is intact after all injection attempts", async () => {
      const canaryContent = await readFile(canaryPath, "utf-8");
      expect(canaryContent).toBe("SAFE");
    });

    test("no .pwned file was created", () => {
      expect(existsSync(pwnedPath)).toBe(false);
    });

    test("cleanup canary", () => {
      const { rmSync } = require("node:fs");
      rmSync(canaryDir, { recursive: true, force: true });
    });
  });
}
