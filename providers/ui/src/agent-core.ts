/**
 * Agent Core — Universal agent logic, zero blocklet dependency.
 *
 * Extracted from blocklets/desktop/command-bar.ts.
 * Provides tool derivation and agent execution for the `agent` AUP primitive.
 */

import { joinURL } from "ufo";

// ── Types ──

export interface AgentContext {
  afs: { exec(path: string, args?: Record<string, unknown>): Promise<{ data?: unknown }> };
  onProgress?: (msg: string) => void;
  onResult?: (msg: string) => void;
  onError?: (err: string) => void;
}

export interface AgentOptions {
  src: string;
  model?: string;
  budget?: { max_rounds?: number; actions_per_round?: number };
}

export interface Message {
  role: string;
  content: string;
}

export interface ToolSpec {
  path: string;
  ops: string[];
  maxDepth?: number;
}

// ── Constants ──

const DEFAULT_MODEL = "/modules/aignehub/types/chat/claude-haiku-4-5";
const DEFAULT_BUDGET = { max_rounds: 20, actions_per_round: 8 };
const READ_OPS = ["read", "list", "stat", "search", "explain"];
/** Max messages to keep in history (sliding window). Prevents unbounded growth. */
const MAX_HISTORY_MESSAGES = 40;

// ── Tool derivation ──

/** Derive agent tools from a src path. Read ops scoped to src, exec on actions only. */
export function deriveAgentTools(src: string, sessionId?: string): ToolSpec[] {
  const tools: ToolSpec[] = [
    { path: joinURL(src, "**"), ops: READ_OPS, maxDepth: 8 },
    { path: joinURL(src, "**/.actions/**"), ops: ["exec"], maxDepth: 2 },
  ];

  if (sessionId) {
    // Reject sessionId containing path traversal or separators
    if (sessionId.includes("..") || sessionId.includes("/")) {
      return tools;
    }
    tools.push({
      path: joinURL("/ui/web/sessions", sessionId, "wm/.actions/**"),
      ops: ["read", "list", "stat", "exec", "search", "explain"],
      maxDepth: 2,
    });
  }

  return tools;
}

// ── Agent execution ──

/**
 * Run an agent with the given text, history, options, and context.
 * Returns the assistant's reply as a Message.
 */
export async function runAgent(
  text: string,
  history: Message[],
  opts: AgentOptions,
  ctx: AgentContext,
): Promise<Message> {
  const tools = deriveAgentTools(opts.src);
  const model = opts.model || DEFAULT_MODEL;
  const budget = { ...DEFAULT_BUDGET, ...opts.budget };

  // Build task with conversation history (capped to prevent unbounded growth)
  let task = text;
  const recentHistory =
    history.length > MAX_HISTORY_MESSAGES ? history.slice(-MAX_HISTORY_MESSAGES) : history;
  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    task = `<conversation_history>\n${historyText}\n</conversation_history>\n\n${text}`;
  }

  try {
    const result = await ctx.afs.exec("/ash/.actions/agent-run", {
      task,
      model,
      tools,
      budget,
      system: `You are an AI agent with access to AFS data at "${opts.src}".`,
      _on_tool_progress: ctx.onProgress
        ? (event: Record<string, unknown>) => {
            ctx.onProgress!(formatProgressEvent(event));
          }
        : undefined,
    });

    const d = (result?.data ?? {}) as Record<string, unknown>;
    let reply: string;
    if (typeof d.result === "string" && d.result) {
      reply = d.result;
    } else if (d.error) {
      reply = `Error: ${d.error}`;
    } else if (d.status === "budget_exhausted") {
      reply = `Ran ${d.rounds ?? "?"} rounds but did not finish.`;
    } else {
      reply = `Agent finished (${d.status || "unknown"}) with no output.`;
    }

    if (ctx.onResult) ctx.onResult(reply);
    return { role: "assistant", content: reply };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const reply = `Error: ${msg}`;
    if (ctx.onError) ctx.onError(reply);
    return { role: "assistant", content: reply };
  }
}

/** Format a single progress event into a human-readable string. */
function formatProgressEvent(event: Record<string, unknown>): string {
  if (event.type === "thinking" && event.text) {
    return `Thinking: ${String(event.text).slice(0, 120)}`;
  }
  if (event.type === "tool_start" && event.calls) {
    const calls = event.calls as Array<{ tool: string; path: string }>;
    return calls.map((c) => `Running: ${c.tool} ${c.path}`).join(", ");
  }
  if (event.type === "tool_result" && event.calls) {
    const calls = event.calls as Array<{ tool: string; status: string }>;
    return calls.map((c) => `${c.status === "ok" ? "✓" : "✗"} ${c.tool}`).join(", ");
  }
  return `Round ${event.round || "?"}...`;
}
