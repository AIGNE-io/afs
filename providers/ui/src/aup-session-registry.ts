/**
 * AUPSessionRegistry — Manages multiple AUP sessions by ID.
 *
 * Zero platform dependencies. Accepts an optional factory function
 * to create session logic instances (defaults to AUPSessionLogic,
 * override with AUPWMSessionLogic for WM support).
 */

import { AUPSessionLogic } from "./aup-session-logic.js";

/** Factory function type for creating session logic instances. */
export type SessionLogicFactory = () => AUPSessionLogic;

export class AUPSessionRegistry {
  private sessions = new Map<string, AUPSessionLogic>();
  private factory: SessionLogicFactory;

  constructor(factory?: SessionLogicFactory) {
    this.factory = factory ?? (() => new AUPSessionLogic());
  }

  /** Get or create a session logic instance. */
  getOrCreate(sessionId: string): AUPSessionLogic {
    let logic = this.sessions.get(sessionId);
    if (!logic) {
      logic = this.factory();
      this.sessions.set(sessionId, logic);
    }
    return logic;
  }

  /** Get a session or undefined. */
  get(sessionId: string): AUPSessionLogic | undefined {
    return this.sessions.get(sessionId);
  }

  /** Check if a session exists. */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Destroy a session. */
  destroy(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Get all session IDs. */
  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }

  /** Total number of sessions. */
  get size(): number {
    return this.sessions.size;
  }
}
