import { getPlatform } from "@aigne/afs";
import { DEVICE_CAPS_WEB_FULL, type DeviceCaps, validateDeviceCaps } from "./aup-types.js";

// ── Message ──

export interface Message {
  id: string;
  type: string;
  from: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface MessageFilter {
  type?: string;
  from?: string;
  ref?: string;
}

// ── Page ──

export interface PageData {
  content: string;
  format: string;
  layout?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// ── Session ──

export class Session {
  readonly id: string;
  readonly endpoint: string;
  readonly created: number;
  private readonly _resumeToken: string;
  private _lastActive: number;
  private _deviceCaps: DeviceCaps;
  private messages: Message[] = [];
  private pages = new Map<string, PageData>();
  private msgCounter = 0;

  constructor(id: string, endpoint: string, caps?: DeviceCaps) {
    this.id = id;
    this.endpoint = endpoint;
    this.created = Date.now();
    const bytes = getPlatform().crypto?.randomBytes(16);
    this._resumeToken = bytes ? bytesToHex(bytes) : Math.random().toString(36).slice(2);
    this._lastActive = this.created;
    this._deviceCaps = caps ?? DEVICE_CAPS_WEB_FULL;
  }

  // ── Messages ──

  addMessage(input: Record<string, unknown>): Message {
    if (!input.type || typeof input.type !== "string") {
      throw new Error("Message requires a 'type' field");
    }
    if (!input.from || typeof input.from !== "string") {
      throw new Error("Message requires a 'from' field");
    }
    this.msgCounter++;
    const msg: Message = {
      ...input,
      id: `msg_${this.msgCounter.toString().padStart(4, "0")}`,
      type: input.type as string,
      from: input.from as string,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(msg);
    this._lastActive = Date.now();
    return msg;
  }

  listMessages(): Message[] {
    return [...this.messages];
  }

  findMessage(id: string): Message | undefined {
    return this.messages.find((m) => m.id === id);
  }

  filterMessages(filter: MessageFilter): Message[] {
    return this.messages.filter((m) => {
      if (filter.type && m.type !== filter.type) return false;
      if (filter.from && m.from !== filter.from) return false;
      if (filter.ref && m.ref !== filter.ref) return false;
      return true;
    });
  }

  // ── Pages ──

  setPage(id: string, data: { content: string; format: string; layout?: Record<string, string> }) {
    const existing = this.pages.get(id);
    const now = Date.now();
    this.pages.set(id, {
      content: data.content,
      format: data.format,
      layout: data.layout,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    this._lastActive = now;
  }

  getPage(id: string): PageData | undefined {
    return this.pages.get(id);
  }

  listPages(): Array<{ id: string; page: PageData }> {
    return Array.from(this.pages, ([id, page]) => ({ id, page }));
  }

  deletePage(id: string) {
    this.pages.delete(id);
  }

  // ── Lifecycle ──

  touch() {
    this._lastActive = Date.now();
  }

  clear() {
    this.messages = [];
    this.pages.clear();
  }

  toMeta() {
    return {
      id: this.id,
      endpoint: this.endpoint,
      created: this.created,
      lastActive: this._lastActive,
      messageCount: this.messages.length,
      pageCount: this.pages.size,
    };
  }

  get lastActive(): number {
    return this._lastActive;
  }

  get resumeToken(): string {
    return this._resumeToken;
  }

  // ── Device Capabilities (D13) ──

  get deviceCaps(): DeviceCaps {
    return this._deviceCaps;
  }

  /** Update device caps. Validates before accepting. Returns error string or null. */
  setDeviceCaps(caps: unknown): string | null {
    const err = validateDeviceCaps(caps);
    if (err) return err;
    this._deviceCaps = caps as DeviceCaps;
    this._lastActive = Date.now();
    return null;
  }
}

// ── SessionManager ──

export class SessionManager {
  private static readonly SESSION_ID_RE = /^[a-f0-9]{16,64}$/i;
  private sessions = new Map<string, Session>();

  create(endpoint: string, caps?: DeviceCaps): Session {
    const bytes = getPlatform().crypto?.randomBytes(8);
    const id = bytes ? bytesToHex(bytes) : Math.random().toString(36).slice(2).padEnd(16, "0");
    const session = new Session(id, endpoint, caps);
    this.sessions.set(id, session);
    return session;
  }

  /** Create (or reclaim) a session with a specific ID — used for sticky reconnect after service restart. */
  createWithId(id: string, endpoint: string, caps?: DeviceCaps): Session {
    if (!SessionManager.isValidSessionId(id)) {
      throw new Error("Invalid session id format");
    }
    const session = new Session(id, endpoint, caps);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);
    return session;
  }

  list(endpoint?: string): Session[] {
    const all = Array.from(this.sessions.values());
    if (endpoint) return all.filter((s) => s.endpoint === endpoint);
    return all;
  }

  delete(id: string) {
    if (!this.sessions.has(id)) throw new Error(`Session not found: ${id}`);
    this.sessions.get(id)!.clear();
    this.sessions.delete(id);
  }

  gc(maxInactiveMs: number) {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > maxInactiveMs) {
        session.clear();
        this.sessions.delete(id);
      }
    }
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  static isValidSessionId(id: string): boolean {
    return SessionManager.SESSION_ID_RE.test(id);
  }
}

/** Convert Uint8Array to hex string (portable, no Buffer dependency). */
function bytesToHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (const b of bytes) {
    hex.push(b.toString(16).padStart(2, "0"));
  }
  return hex.join("");
}
