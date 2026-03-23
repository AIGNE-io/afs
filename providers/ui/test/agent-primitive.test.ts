/**
 * Agent Primitive — Task 6
 *
 * Tests for agent-core (deriveAgentTools, runAgent) and registry entry.
 * TDD: tests written before implementation.
 */

import { describe, expect, test } from "bun:test";
import {
  type AgentContext,
  type AgentOptions,
  deriveAgentTools,
  runAgent,
} from "../src/agent-core.js";

// ── deriveAgentTools — src → tool scope ──

describe("deriveAgentTools — src → tool scope", () => {
  test('src: "/" → tools scope /** (global read-only)', () => {
    const tools = deriveAgentTools("/");
    expect(tools.length).toBeGreaterThanOrEqual(1);
    const readTool = tools.find((t) => t.path === "/**");
    expect(readTool).toBeTruthy();
    expect(readTool!.ops).toContain("read");
    expect(readTool!.ops).toContain("list");
    expect(readTool!.ops).toContain("stat");
    expect(readTool!.ops).toContain("search");
    expect(readTool!.ops).toContain("explain");
    // Should NOT include write
    expect(readTool!.ops).not.toContain("write");
  });

  test('src: "/inbox" → tools scope /inbox/** (scoped read-only)', () => {
    const tools = deriveAgentTools("/inbox");
    const readTool = tools.find((t) => t.path === "/inbox/**");
    expect(readTool).toBeTruthy();
    expect(readTool!.ops).toContain("read");
    expect(readTool!.ops).toContain("list");
  });

  test('src: "/inbox" → exec only on .actions/**', () => {
    const tools = deriveAgentTools("/inbox");
    const execTool = tools.find((t) => t.ops.includes("exec"));
    expect(execTool).toBeTruthy();
    expect(execTool!.path).toBe("/inbox/**/.actions/**");
  });

  test("tools include read, list, stat, search, explain ops", () => {
    const tools = deriveAgentTools("/workspace");
    const readTool = tools.find((t) => t.path === "/workspace/**");
    expect(readTool).toBeTruthy();
    for (const op of ["read", "list", "stat", "search", "explain"]) {
      expect(readTool!.ops).toContain(op);
    }
  });

  test("sessionId adds WM scope tool", () => {
    const tools = deriveAgentTools("/inbox", "session-123");
    const wmTool = tools.find((t) => t.path.includes("sessions/session-123"));
    expect(wmTool).toBeTruthy();
    expect(wmTool!.ops).toContain("exec");
  });
});

// ── runAgent ──

describe("runAgent", () => {
  test("calls afs.exec with agent-run action", async () => {
    const execCalls: Array<{ path: string; args?: Record<string, unknown> }> = [];
    const ctx: AgentContext = {
      afs: {
        async exec(path, args) {
          execCalls.push({ path, args });
          return { data: { status: "done", result: "Hello!" } };
        },
      },
    };
    const opts: AgentOptions = { src: "/inbox" };

    const result = await runAgent("What is this?", [], opts, ctx);

    expect(execCalls.length).toBe(1);
    expect(execCalls[0]!.path).toBe("/ash/.actions/agent-run");
    expect(result.role).toBe("assistant");
    expect(result.content).toContain("Hello!");
  });

  test("passes history as conversation context", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const ctx: AgentContext = {
      afs: {
        async exec(_path, args) {
          capturedArgs = args;
          return { data: { status: "done", result: "response" } };
        },
      },
    };
    const history = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];

    await runAgent("Follow up", history, { src: "/" }, ctx);

    expect(capturedArgs).toBeTruthy();
    const task = capturedArgs!.task as string;
    expect(task).toContain("Hi");
    expect(task).toContain("Follow up");
  });

  test("handles agent-run error gracefully", async () => {
    const ctx: AgentContext = {
      afs: {
        async exec() {
          throw new Error("LLM unavailable");
        },
      },
    };

    const result = await runAgent("test", [], { src: "/" }, ctx);

    expect(result.role).toBe("assistant");
    expect(result.content).toContain("Error");
    expect(result.content).toContain("LLM unavailable");
  });

  test("budget_exhausted returns informative message", async () => {
    const ctx: AgentContext = {
      afs: {
        async exec() {
          return { data: { status: "budget_exhausted", rounds: 20 } };
        },
      },
    };

    const result = await runAgent("complex task", [], { src: "/" }, ctx);

    expect(result.content).toContain("20");
  });

  test("uses custom model when provided", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const ctx: AgentContext = {
      afs: {
        async exec(_path, args) {
          capturedArgs = args;
          return { data: { status: "done", result: "ok" } };
        },
      },
    };

    await runAgent("test", [], { src: "/", model: "claude-opus-4-6" }, ctx);

    expect(capturedArgs!.model).toBe("claude-opus-4-6");
  });

  test("uses custom budget when provided", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const ctx: AgentContext = {
      afs: {
        async exec(_path, args) {
          capturedArgs = args;
          return { data: { status: "done", result: "ok" } };
        },
      },
    };

    await runAgent("test", [], { src: "/", budget: { max_rounds: 5 } }, ctx);

    expect((capturedArgs!.budget as Record<string, unknown>).max_rounds).toBe(5);
  });

  test("onProgress callback receives updates", async () => {
    const progressMessages: string[] = [];
    const ctx: AgentContext = {
      afs: {
        async exec(_path, args) {
          // Simulate calling the progress callback
          const onProgress = args?._on_tool_progress as
            | ((event: Record<string, unknown>) => void)
            | undefined;
          if (onProgress) {
            onProgress({ type: "thinking", round: 1, text: "Analyzing..." });
          }
          return { data: { status: "done", result: "done" } };
        },
      },
      onProgress: (msg) => progressMessages.push(msg),
    };

    await runAgent("test", [], { src: "/" }, ctx);

    expect(progressMessages.length).toBeGreaterThan(0);
  });
});

// ── Agent registry entry ──

describe("agent registry entry", () => {
  test("agent is registered in PRIMITIVES", async () => {
    const { PRIMITIVES } = await import("../src/aup-registry.js");
    expect(PRIMITIVES.agent).toBeTruthy();
  });

  test('category = "subsystem"', async () => {
    const { PRIMITIVES } = await import("../src/aup-registry.js");
    expect(PRIMITIVES.agent!.category).toBe("subsystem");
  });

  test('events includes "submit"', async () => {
    const { PRIMITIVES } = await import("../src/aup-registry.js");
    expect(PRIMITIVES.agent!.events).toContain("submit");
  });

  test("has mode prop with chat/hud/bar enum", async () => {
    const { PRIMITIVES } = await import("../src/aup-registry.js");
    const agentDef = PRIMITIVES.agent!;
    expect(agentDef.props.mode).toBeTruthy();
    expect(agentDef.props.mode!.enum).toContain("chat");
    expect(agentDef.props.mode!.enum).toContain("hud");
    expect(agentDef.props.mode!.enum).toContain("bar");
  });

  test("containable is false", async () => {
    const { PRIMITIVES } = await import("../src/aup-registry.js");
    expect(PRIMITIVES.agent!.containable).toBe(false);
  });
});
