/**
 * AFS Explorer State Management
 *
 * Simple state management for the explorer.
 */

import type { ExplorerState } from "./types.js";

/**
 * State change listener
 */
export type StateListener = (state: ExplorerState, prevState: ExplorerState) => void;

/**
 * State store for explorer
 */
export class ExplorerStore {
  private state: ExplorerState;
  private listeners: Set<StateListener> = new Set();

  constructor(initialState: ExplorerState) {
    this.state = initialState;
  }

  /**
   * Get current state
   */
  getState(): ExplorerState {
    return this.state;
  }

  /**
   * Update state with partial update
   */
  setState(update: Partial<ExplorerState>): void {
    const prevState = this.state;
    this.state = { ...this.state, ...update };

    // Notify listeners
    for (const listener of this.listeners) {
      listener(this.state, prevState);
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reset to initial state
   */
  reset(initialState: ExplorerState): void {
    const prevState = this.state;
    this.state = initialState;

    for (const listener of this.listeners) {
      listener(this.state, prevState);
    }
  }
}

/**
 * Create a new store with initial state
 */
export function createStore(initialState: ExplorerState): ExplorerStore {
  return new ExplorerStore(initialState);
}
