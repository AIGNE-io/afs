/**
 * AFS Conformance Test Suite — WebSocket Harness for AUP Protocol
 *
 * Generic WebSocket client that connects to an AUP server, executes
 * send/expect/sleep steps, and collects results. Works against any
 * server implementing the AUP WebSocket sub-protocol.
 *
 * Uses the Node.js built-in WebSocket (available since Node 22).
 */

import { assertDeepMatch } from "./assertions.js";
import type { TestResult } from "./types.js";
import type {
  AupEventMessage,
  ClientMessage,
  DeviceCaps,
  JoinSessionMessage,
  ServerMessage,
  WsExpectStep,
  WsSendStep,
  WsSleepStep,
  WsTestSpec,
  WsTestStep,
} from "./ws-types.js";

// ---------------------------------------------------------------------------
// Default DeviceCaps (web desktop, all primitives native)
// ---------------------------------------------------------------------------

const DEFAULT_CAPS: DeviceCaps = {
  platform: "web",
  formFactor: "desktop",
  display: {
    type: "visual",
    color: "full",
    refresh: "realtime",
    resolution: { w: 1920, h: 1080 },
    depth: "2d",
  },
  input: {
    touch: false,
    keyboard: true,
    voice: false,
    gaze: false,
    gesture: false,
    dpad: false,
    controller: false,
  },
  primitives: {
    view: "native",
    text: "native",
    media: "native",
    input: "native",
    action: "native",
    overlay: "native",
    table: "native",
    time: "native",
    chart: "webview",
    map: "webview",
    calendar: "native",
    chat: "native",
    rtc: "unsupported",
    explorer: "native",
    editor: "native",
    canvas: "webview",
    "afs-list": "native",
    nav: "native",
  },
};

// ---------------------------------------------------------------------------
// AUP WebSocket Session
// ---------------------------------------------------------------------------

/**
 * Manages a single WebSocket connection to an AUP server.
 * Collects all received messages in an ordered buffer for assertion.
 */
export class AupWsSession {
  private ws: WebSocket | null = null;
  private messageBuffer: ServerMessage[] = [];
  private messageWaiters: Array<(msg: ServerMessage) => void> = [];
  private closePromise: Promise<{ code: number; reason: string }> | null = null;
  private connected = false;
  private errors: string[] = [];

  /**
   * Connect to the AUP WebSocket server.
   */
  async connect(url: string, timeoutMs = 5000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.ws = new WebSocket(url);

      this.closePromise = new Promise<{ code: number; reason: string }>((res) => {
        this.ws!.addEventListener("close", (ev) => {
          this.connected = false;
          res({ code: ev.code, reason: ev.reason });
        });
      });

      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        this.connected = true;
        resolve();
      });

      this.ws.addEventListener("error", (ev) => {
        clearTimeout(timer);
        const errorMsg = `WebSocket error: ${(ev as ErrorEvent).message ?? "unknown"}`;
        this.errors.push(errorMsg);
        if (!this.connected) {
          reject(new Error(errorMsg));
        }
      });

      this.ws.addEventListener("message", (ev) => {
        try {
          const data = typeof ev.data === "string" ? ev.data : String(ev.data);
          const msg = JSON.parse(data) as ServerMessage;
          // If someone is waiting, deliver directly
          if (this.messageWaiters.length > 0) {
            const waiter = this.messageWaiters.shift()!;
            waiter(msg);
          } else {
            this.messageBuffer.push(msg);
          }
        } catch {
          this.errors.push(`Failed to parse server message: ${String(ev.data)}`);
        }
      });
    });
  }

  /**
   * Send a JSON message to the server.
   */
  send(message: ClientMessage): void {
    if (!this.ws || !this.connected) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send join_session with the given (or default) DeviceCaps.
   */
  sendJoinSession(caps?: DeviceCaps, sessionId?: string, sessionToken?: string): void {
    const msg: JoinSessionMessage = {
      type: "join_session",
      caps: caps ?? DEFAULT_CAPS,
    };
    if (sessionId) msg.sessionId = sessionId;
    if (sessionToken) msg.sessionToken = sessionToken;
    this.send(msg);
  }

  /**
   * Send an aup_event message.
   */
  sendEvent(nodeId: string, event: string, data?: Record<string, unknown>): void {
    const msg: AupEventMessage = {
      type: "aup_event",
      nodeId,
      event,
    };
    if (data) msg.data = data;
    this.send(msg);
  }

  /**
   * Wait for the next server message, with timeout.
   */
  async waitForMessage(timeoutMs = 2000): Promise<ServerMessage> {
    // Check buffer first
    if (this.messageBuffer.length > 0) {
      return this.messageBuffer.shift()!;
    }

    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter
        const idx = this.messageWaiters.indexOf(waiterFn);
        if (idx !== -1) this.messageWaiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      const waiterFn = (msg: ServerMessage) => {
        clearTimeout(timer);
        resolve(msg);
      };

      this.messageWaiters.push(waiterFn);
    });
  }

  /**
   * Wait for a message matching specific type (and optionally action),
   * skipping non-matching messages (they remain in the buffer for later assertions).
   */
  async waitForMessageType(
    messageType: string,
    messageAction?: string,
    timeoutMs = 2000,
  ): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;

    // Check buffer first for an existing match
    for (let i = 0; i < this.messageBuffer.length; i++) {
      const msg = this.messageBuffer[i];
      if (matchesTypeAndAction(msg, messageType, messageAction)) {
        this.messageBuffer.splice(i, 1);
        return msg;
      }
    }

    // Wait for new messages
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      try {
        const msg = await this.waitForMessage(remaining);
        if (matchesTypeAndAction(msg, messageType, messageAction)) {
          return msg;
        }
        // Non-matching message goes back to buffer
        this.messageBuffer.push(msg);
      } catch {
        break; // timeout
      }
    }

    throw new Error(
      `Timed out waiting for message type="${messageType}"` +
        (messageAction ? ` action="${messageAction}"` : "") +
        ` after ${timeoutMs}ms`,
    );
  }

  /**
   * Get all received messages (for debugging / post-hoc assertions).
   */
  getReceivedMessages(): ServerMessage[] {
    return [...this.messageBuffer];
  }

  /**
   * Get accumulated errors.
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Close the WebSocket connection cleanly.
   */
  async close(code = 1000, reason = "test complete"): Promise<{ code: number; reason: string }> {
    if (!this.ws) {
      return { code: 1000, reason: "not connected" };
    }
    if (this.connected) {
      this.ws.close(code, reason);
    }
    return this.closePromise ?? { code: 1000, reason: "already closed" };
  }

  /**
   * Whether the connection is currently open.
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesTypeAndAction(msg: ServerMessage, type: string, action?: string): boolean {
  if (msg.type !== type) return false;
  if (action && "action" in msg && (msg as Record<string, unknown>).action !== action) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Step executors
// ---------------------------------------------------------------------------

async function executeSendStep(session: AupWsSession, step: WsSendStep): Promise<string[]> {
  try {
    session.send(step.message);
    return [];
  } catch (err) {
    return [`send failed: ${err instanceof Error ? err.message : String(err)}`];
  }
}

async function executeExpectStep(session: AupWsSession, step: WsExpectStep): Promise<string[]> {
  const timeout = step.timeoutMs ?? 2000;

  try {
    const msg = await session.waitForMessageType(step.messageType, step.messageAction, timeout);

    // If match criteria specified, assert partial match
    if (step.match) {
      return assertDeepMatch(msg, step.match, "$");
    }

    return [];
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
}

async function executeSleepStep(step: WsSleepStep): Promise<string[]> {
  await sleep(step.durationMs);
  return [];
}

// ---------------------------------------------------------------------------
// Public: run a full WS test spec
// ---------------------------------------------------------------------------

/**
 * Run a single WsTestSpec against the given WebSocket URL.
 * Returns a TestResult compatible with the existing reporter.
 */
export async function runWsSpec(
  wsUrl: string,
  spec: WsTestSpec,
  file: string,
): Promise<TestResult> {
  if (spec.skip) {
    return {
      name: spec.name,
      file,
      passed: true,
      durationMs: 0,
      errors: [],
      skipped: true,
    };
  }

  const start = performance.now();
  const errors: string[] = [];
  const session = new AupWsSession();

  try {
    // Connect
    await session.connect(wsUrl);

    // Execute steps
    for (let i = 0; i < spec.steps.length; i++) {
      const step = spec.steps[i];
      const stepLabel = step.name ?? `step ${i + 1} (${step.action})`;

      let stepErrors: string[];

      switch (step.action) {
        case "send":
          stepErrors = await executeSendStep(session, step);
          break;
        case "expect":
          stepErrors = await executeExpectStep(session, step);
          break;
        case "sleep":
          stepErrors = await executeSleepStep(step);
          break;
        default:
          stepErrors = [`unknown step action: ${(step as WsTestStep).action}`];
      }

      if (stepErrors.length > 0) {
        errors.push(...stepErrors.map((e) => `${stepLabel}: ${e}`));
        break; // Stop on first step failure
      }
    }
  } catch (err) {
    errors.push(`connection: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Always close
    try {
      await session.close();
    } catch {
      // ignore close errors in cleanup
    }
  }

  // Append any session-level errors (parse failures, etc.)
  errors.push(...session.getErrors());

  const durationMs = Math.round(performance.now() - start);

  return {
    name: spec.name,
    file,
    passed: errors.length === 0,
    durationMs,
    errors,
    skipped: false,
  };
}
