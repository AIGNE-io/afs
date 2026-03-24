/**
 * AFS Conformance Test Suite — WebSocket / AUP types
 *
 * Types for AUP protocol messages used by the WebSocket test harness.
 * Derived from spec/aup-protocol.md.
 */

// ---------------------------------------------------------------------------
// Device Capabilities (sent by client in join_session)
// ---------------------------------------------------------------------------

export type PrimitiveCap = "native" | "webview" | "partial" | "unsupported";

export interface DeviceDisplay {
  type?: "visual" | "spatial" | "audio-only" | "tactile";
  color?: "full" | "limited" | "mono";
  refresh?: "realtime" | "slow";
  resolution?: { w: number; h: number };
  depth?: "2d" | "3d";
}

export interface DeviceInput {
  touch?: boolean;
  keyboard?: boolean;
  voice?: boolean;
  gaze?: boolean;
  gesture?: boolean;
  dpad?: boolean;
  controller?: boolean;
}

export interface DeviceCaps {
  platform: string;
  formFactor: string;
  display?: DeviceDisplay;
  input?: DeviceInput;
  primitives: Record<string, PrimitiveCap>;
  features?: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Client -> Server messages
// ---------------------------------------------------------------------------

export interface JoinSessionMessage {
  type: "join_session";
  sessionId?: string;
  sessionToken?: string;
  treeVersion?: number;
  caps?: DeviceCaps;
}

export interface JoinChannelMessage {
  type: "join_channel";
  channelId: string;
}

export interface AupEventMessage {
  type: "aup_event";
  nodeId: string;
  event: string;
  data?: Record<string, unknown>;
}

export type ClientMessage = JoinSessionMessage | JoinChannelMessage | AupEventMessage;

// ---------------------------------------------------------------------------
// Server -> Client messages
// ---------------------------------------------------------------------------

export interface AupNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  src?: string;
  bind?: string;
  state?: Record<string, unknown>;
  events?: Record<string, { exec: string; args?: Record<string, unknown> }>;
  children?: AupNode[];
}

export interface AupPatchOp {
  op: "create" | "update" | "remove" | "reorder";
  id: string;
  parentId?: string;
  node?: AupNode;
  index?: number;
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;
  events?: Record<string, { exec: string; args?: Record<string, unknown> }>;
}

export interface SessionAckMessage {
  type: "session";
  sessionId: string;
  sessionToken?: string | null;
}

export interface ChannelAckMessage {
  type: "channel";
  channelId: string;
}

export interface AupRenderMessage {
  type: "aup";
  action: "render";
  root: AupNode;
  treeVersion: number;
  fullPage?: boolean;
  chrome?: boolean;
  theme?: string;
  style?: string;
  locale?: string;
}

export interface AupPatchMessage {
  type: "aup";
  action: "patch";
  ops: AupPatchOp[];
  treeVersion: number;
}

export interface AupStageMessage {
  type: "aup";
  action: "stage";
  sceneId: string;
  root: AupNode;
  treeVersion: number;
}

export interface AupTakeMessage {
  type: "aup";
  action: "take";
  sceneId: string;
}

export interface AupEventResultMessage {
  type: "aup_event_result";
  nodeId: string;
  event: string;
  result?: unknown;
  error?: string | null;
}

export type AupMessage = AupRenderMessage | AupPatchMessage | AupStageMessage | AupTakeMessage;

export type ServerMessage =
  | SessionAckMessage
  | ChannelAckMessage
  | AupMessage
  | AupEventResultMessage
  | { type: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// WebSocket test spec types (extend the base TestSpec for transport: "ws")
// ---------------------------------------------------------------------------

export interface WsTestSpec {
  /** Human-readable test name */
  name: string;

  /** Transport discriminator */
  transport: "ws";

  /** Optional tags for filtering */
  tags?: string[];

  /** Optional: skip this test */
  skip?: boolean;

  /** Optional: description */
  description?: string;

  /** Ordered steps executed over a single WebSocket connection */
  steps: WsTestStep[];

  /** DeviceCaps to send in join_session (optional, defaults to a web-desktop preset) */
  caps?: DeviceCaps;
}

export type WsTestStep = WsSendStep | WsExpectStep | WsSleepStep;

export interface WsSendStep {
  /** Send a message to the server */
  action: "send";
  /** Optional step label */
  name?: string;
  /** The message object to send (JSON-serialized) */
  message: ClientMessage;
}

export interface WsExpectStep {
  /** Wait for a message from the server matching criteria */
  action: "expect";
  /** Optional step label */
  name?: string;
  /** Expected message type (e.g. "session", "aup", "aup_event_result") */
  messageType: string;
  /** For type:"aup" messages, optionally match the action field */
  messageAction?: string;
  /** Timeout in milliseconds (default: 2000) */
  timeoutMs?: number;
  /** Partial-match assertion on the received message */
  match?: Record<string, unknown>;
}

export interface WsSleepStep {
  /** Pause between steps */
  action: "sleep";
  /** Optional step label */
  name?: string;
  /** Duration in milliseconds */
  durationMs: number;
}
