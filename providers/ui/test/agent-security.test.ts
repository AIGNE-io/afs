/**
 * Agent Security Defaults — migrated from blocklets/desktop/test/command-bar-security.test.ts
 *
 * Tests agent-core's deriveAgentTools security model:
 * - Read-only by default (no write)
 * - Exec only on .actions paths
 * - Budget constraints
 */

import { describe, expect, test } from "bun:test";
import { deriveAgentTools } from "../src/agent-core.js";

describe("agent security defaults", () => {
  test("global scope (src='/') is read-only — no write, no exec on root", () => {
    const tools = deriveAgentTools("/");
    const readTool = tools.find((tool) => tool.path === "/**");

    expect(readTool).toBeDefined();
    expect(readTool!.ops).not.toContain("write");
    expect(readTool!.ops).not.toContain("exec");
  });

  test("scoped src is read-only — no write", () => {
    const tools = deriveAgentTools("/inbox");
    const readTool = tools.find((tool) => tool.path === "/inbox/**");

    expect(readTool).toBeDefined();
    expect(readTool!.ops).not.toContain("write");
    expect(readTool!.ops).not.toContain("exec");
  });

  test("exec is only allowed on .actions paths", () => {
    const tools = deriveAgentTools("/inbox");
    const execTool = tools.find((tool) => tool.ops.includes("exec"));

    expect(execTool).toBeDefined();
    expect(execTool!.path).toBe("/inbox/**/.actions/**");
  });

  test("session WM scope is explicitly constrained when sessionId provided", () => {
    const tools = deriveAgentTools("/", "test-session");
    const wmTool = tools.find((tool) => tool.path.includes("sessions/test-session"));

    expect(wmTool).toBeDefined();
    expect(wmTool!.ops).toContain("exec");
    expect(wmTool!.ops).not.toContain("write");
  });

  test("no tool grants write access", () => {
    const tools = deriveAgentTools("/", "session-1");
    for (const tool of tools) {
      expect(tool.ops).not.toContain("write");
    }
  });
});
