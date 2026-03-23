/**
 * AFS Event System
 *
 * In-process pub/sub for provider-emitted events.
 * Providers emit events, consumers subscribe with filters.
 * Fire-and-forget semantics — subscriber errors do not propagate.
 */

import { joinURL } from "ufo";

// ─── Types ─────────────────────────────────────────────────────────

/** Event emitted by a provider */
export interface AFSEvent {
  /** Event type (e.g., "frigate:detection", "afs:write") */
  type: string;
  /** AFS absolute path (mount-prefixed) */
  path: string;
  /** Provider name that emitted the event */
  source: string;
  /** Epoch milliseconds when the event was emitted */
  timestamp: number;
  /** Optional event payload (provider-defined) */
  data?: Record<string, unknown>;
}

/** Filter for subscribing to events. All conditions are AND-combined. */
export interface AFSEventFilter {
  /** Exact match or wildcard (e.g., "test:*" matches "test:anything") */
  type?: string;
  /** Path prefix match at path boundaries */
  path?: string;
  /** Exact match on provider name */
  source?: string;
}

/** Declaration of an event type that a provider can emit */
export interface AFSEventDeclaration {
  /** Event type identifier (e.g., "frigate:detection") */
  type: string;
  /** Human-readable description of the event */
  description?: string;
  /** JSON Schema describing the event's data payload */
  dataSchema?: Record<string, unknown>;
}

/** Callback invoked when a matching event is received */
export type AFSEventCallback = (event: AFSEvent) => void;

/** Function to unsubscribe from events */
export type AFSUnsubscribe = () => void;

/** Event sink injected into providers via onMount */
export type AFSEventSink = (event: Omit<AFSEvent, "source" | "timestamp">) => void;

// ─── EventBus ──────────────────────────────────────────────────────

interface Subscription {
  filter: AFSEventFilter;
  callback: AFSEventCallback;
}

export class EventBus {
  private subscriptions = new Set<Subscription>();

  subscribe(filter: AFSEventFilter, callback: AFSEventCallback): AFSUnsubscribe {
    const sub: Subscription = { filter, callback };
    this.subscriptions.add(sub);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.subscriptions.delete(sub);
    };
  }

  dispatch(event: AFSEvent): void {
    for (const sub of this.subscriptions) {
      if (!matchesFilter(sub.filter, event)) continue;
      try {
        sub.callback(event);
      } catch {
        // INV: subscriber failure MUST NOT affect dispatch
      }
    }
  }
}

// ─── Filter Matching ───────────────────────────────────────────────

function matchesFilter(filter: AFSEventFilter, event: AFSEvent): boolean {
  // Type match: exact or wildcard
  if (filter.type && filter.type !== "") {
    if (!matchType(filter.type, event.type)) return false;
  }

  // Path match: prefix at path boundary
  if (filter.path && filter.path !== "") {
    if (!matchPath(filter.path, event.path)) return false;
  }

  // Source match: exact
  if (filter.source && filter.source !== "") {
    if (filter.source !== event.source) return false;
  }

  return true;
}

/** Match type with optional wildcard: "x:*" or "*:x" */
function matchType(pattern: string, type: string): boolean {
  // Trailing wildcard: "messaging:*" matches "messaging:message"
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -1); // "messaging:"
    return type.startsWith(prefix);
  }
  // Leading wildcard: "*:message" matches "messaging:message" and bare "message"
  if (pattern.startsWith("*:")) {
    const suffix = pattern.slice(1); // ":message"
    const bare = pattern.slice(2); // "message"
    return type.endsWith(suffix) || type === bare;
  }
  // Exact match
  return pattern === type;
}

/**
 * Match path at path boundaries with optional `*` wildcards.
 *
 * - "/a" matches "/a", "/a/b" but not "/ab" (prefix at boundary)
 * - "/a/&#42;/c" matches "/a/x/c", "/a/x/c/d" (wildcard = one segment)
 * - No wildcard → fast prefix check
 */
function matchPath(filterPath: string, eventPath: string): boolean {
  if (filterPath === "/") return true;

  // Fast path: no wildcards → simple prefix match
  if (!filterPath.includes("*")) {
    if (eventPath === filterPath) return true;
    return eventPath.startsWith(`${filterPath}/`);
  }

  // Glob path: split into segments and match with * as single-segment wildcard
  const filterSegs = filterPath.split("/").filter(Boolean);
  const eventSegs = eventPath.split("/").filter(Boolean);

  // Event must have at least as many segments as the filter
  if (eventSegs.length < filterSegs.length) return false;

  // Match each filter segment against the corresponding event segment
  for (let i = 0; i < filterSegs.length; i++) {
    if (filterSegs[i] === "*") continue;
    if (filterSegs[i] !== eventSegs[i]) return false;
  }

  // All filter segments matched — remaining event segments are children (prefix semantics)
  return true;
}

// ─── Event Sink Factory ────────────────────────────────────────────

/** Create an event sink for a specific provider mount */
export function createEventSink(
  bus: EventBus,
  providerName: string,
  mountPath: string,
): AFSEventSink {
  return (partial) => {
    const event: AFSEvent = {
      type: partial.type,
      path: joinURL(mountPath, partial.path),
      source: providerName,
      timestamp: Date.now(),
      data: partial.data,
    };
    bus.dispatch(event);
  };
}
