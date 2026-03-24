/**
 * AUPSessionLogic — Pure platform-independent AUP session coordination.
 *
 * Owns per-session state: AUPNodeStore, AUPSceneManager.
 * Zero platform dependencies — no node:, no WebSocket, no HTTP.
 * Can be used identically in Node/Bun (ws library), Workers (Durable Object),
 * or any other runtime.
 *
 * Transport layer (WebSocket, Durable Object, etc.) is separate — it calls
 * dispatch() on incoming messages and sends results to clients.
 *
 * WM (window manager) operations are provided by the AUPWMSessionLogic
 * subclass in aup-wm-session-logic.ts.
 */

import type { AFSLogger } from "@aigne/afs";
import { AUPNodeStore, type AUPRenderOptions, AUPSceneManager } from "./aup-protocol.js";
import type { AUPNode, AUPPatchOp } from "./aup-types.js";

/** Result of an AUP message dispatch — tells the transport what to send back. */
export interface AUPDispatchResult {
  /** The direct return value for the caller (event result, status, etc.) */
  returnValue?: unknown;
  /** Messages to broadcast to the session's connected clients */
  broadcast?: Record<string, unknown>[];
}

/**
 * Per-session AUP logic — pure computation, zero I/O.
 *
 * One instance per session (or per channel for live-sharing).
 * Transport layer creates this and calls dispatch() on incoming messages.
 *
 * Subclass (AUPWMSessionLogic) adds WM operations.
 */
export class AUPSessionLogic {
  protected store = new AUPNodeStore();
  protected sceneManager = new AUPSceneManager();

  /** Optional logger — injected by caller after creation. */
  logger?: AFSLogger;

  /** External event handler — called for events that need AFS exec dispatch. */
  onExecEvent?: (
    nodeId: string,
    event: string,
    execPath: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;

  /** Page resolver — called when an event uses `page` dispatch mode. */
  pageResolver?:
    | ((
        name: string,
        locale?: string,
      ) => Promise<{ tree: AUPNode; tone?: string; palette?: string } | undefined>)
    | undefined;

  /** Default tone — fallback when a page doesn't define its own tone. */
  defaultTone?: string;

  /** Default palette — fallback when a page doesn't define its own palette. */
  defaultPalette?: string;

  /** Current session locale (e.g. "en", "zh", "ja"). */
  locale?: string;

  /** Current page name — tracked for locale-change re-render. */
  currentPage?: string;

  /** Session context — exposed to AUP templates via $session.* variables. */
  private _sessionCtx: {
    authenticated: boolean;
    did?: string;
    displayName?: string;
    role?: string;
    authMethod?: string;
    isAdmin?: boolean;
    isOwner?: boolean;
  } = { authenticated: false };

  /** Set session context (called by onSessionStart when caller identity is available). */
  setSessionContext(ctx: {
    did: string;
    displayName?: string;
    role?: string;
    authMethod?: string;
  }): void {
    this._sessionCtx = {
      ...ctx,
      authenticated: true,
      isAdmin: ctx.role === "owner" || ctx.role === "admin",
      isOwner: ctx.role === "owner",
    };
  }

  /** Get current session context (for rendering). */
  getSessionContext(): typeof this._sessionCtx {
    return this._sessionCtx;
  }

  /** Resolve a $session.* variable reference. */
  resolveSessionVariable(ref: string): unknown {
    if (!ref.startsWith("$session.")) return ref;
    const key = ref.slice("$session.".length);
    return this._sessionCtx[key as keyof typeof this._sessionCtx];
  }

  /** Get the current AUP node store (for snapshot delivery on reconnect). */
  getStore(): AUPNodeStore {
    return this.store;
  }

  /** Get the scene manager (for dual-buffer stage/take). */
  getSceneManager(): AUPSceneManager {
    return this.sceneManager;
  }

  /** Current tree version. */
  get version(): number {
    return this.store.version;
  }

  /** Get the current root node (for snapshot replay). */
  getRoot(): AUPNode | null {
    return this.store.getRoot();
  }

  // ==================== Core AUP Operations ====================

  /** Set the full AUP tree (aup_render action). */
  render(root: AUPNode, options?: AUPRenderOptions): AUPDispatchResult {
    this.store.setRoot(root);
    if (options) {
      this.store.setRenderOptions(options);
    }
    if (options?.page) this.currentPage = options.page;
    const msg: Record<string, unknown> = {
      type: "aup",
      action: "render",
      root,
      treeVersion: this.store.version,
    };
    if (options?.fullPage) msg.fullPage = true;
    if (options?.chrome) msg.chrome = true;
    if (options?.tone) msg.tone = options.tone;
    if (options?.palette) msg.palette = options.palette;
    if (options?.locale) msg.locale = options.locale;
    if (options?.title) msg.title = options.title;
    if (options?.page) msg.page = options.page;
    if (options?.designMode) msg.designMode = true;
    msg.sessionContext = this._sessionCtx;
    return { broadcast: [msg] };
  }

  /** Apply a patch to the AUP tree. */
  patch(ops: AUPPatchOp[]): AUPDispatchResult {
    this.store.applyPatch(ops);
    return {
      broadcast: [
        {
          type: "aup",
          action: "patch",
          ops,
          treeVersion: this.store.version,
        },
      ],
    };
  }

  /** Stage a scene (dual-buffer: prepare without displaying). */
  stage(sceneId: string, root: AUPNode, options?: AUPRenderOptions): AUPDispatchResult {
    this.sceneManager.stage(sceneId, root, options);
    const msg: Record<string, unknown> = {
      type: "aup",
      action: "stage",
      sceneId,
      root,
      treeVersion: this.sceneManager.getScene(sceneId)?.version ?? 0,
    };
    if (options?.fullPage) msg.fullPage = true;
    if (options?.chrome) msg.chrome = true;
    if (options?.tone) msg.tone = options.tone;
    if (options?.palette) msg.palette = options.palette;
    if (options?.locale) msg.locale = options.locale;
    if (options?.title) msg.title = options.title;
    return { broadcast: [msg] };
  }

  /** Take (activate) a staged scene. */
  take(sceneId: string): AUPDispatchResult {
    this.sceneManager.take(sceneId);
    return {
      broadcast: [{ type: "aup", action: "take", sceneId }],
    };
  }

  /**
   * Handle node-type-specific events. Override in subclass to add
   * WM/surface event handling. Return undefined to fall through to
   * generic event handling.
   */
  protected handleNodeEvent(
    _node: AUPNode,
    _nodeId: string,
    _event: string,
    _data: Record<string, unknown>,
  ): AUPDispatchResult | undefined {
    return undefined;
  }

  /** Handle an AUP event from a client (click, input, etc.). */
  async handleEvent(
    nodeId: string,
    event: string,
    data?: Record<string, unknown>,
  ): Promise<AUPDispatchResult> {
    const node = this.store.findNode(nodeId);
    if (!node) throw new Error(`AUP node not found: ${nodeId}`);

    // Let subclass handle node-type-specific events (WM, surfaces, etc.)
    const specialResult = this.handleNodeEvent(node, nodeId, event, data ?? {});
    if (specialResult !== undefined) return specialResult;

    const evtConfig = node.events?.[event];
    if (!evtConfig) {
      // Agent/command-bar submit — route via onExecEvent as "agent-submit"
      if (event === "submit" && (node.type === "agent" || node.type === "command-bar")) {
        if (this.onExecEvent) {
          const result = await this.onExecEvent(nodeId, event, "agent-submit", data ?? {});
          if (result !== undefined) return { returnValue: result };
        }
      }
      // No event config — try external handler with synthetic config
      if (this.onExecEvent) {
        const result = await this.onExecEvent(nodeId, event, event, data ?? {});
        if (result !== undefined) return { returnValue: result };
      }
      if (!node.events) throw new Error(`Node '${nodeId}' has no events`);
      throw new Error(`Node '${nodeId}' has no '${event}' event`);
    }

    // ── target+set mode — direct node update or _root page navigation ──
    if (evtConfig.target && evtConfig.set) {
      const resolved = resolveSetArgs(evtConfig.set as Record<string, unknown>, data ?? {});

      // target="_root" + set.page → full page navigation
      if (evtConfig.target === "_root" && resolved.page) {
        return this._handlePageNavigation(resolved.page as string);
      }

      const patchOp = { op: "update" as const, id: evtConfig.target, ...resolved };
      this.store.applyPatch([patchOp]);
      return {
        returnValue: { ok: true, target: evtConfig.target },
        broadcast: [
          { type: "aup", action: "patch", ops: [patchOp], treeVersion: this.store.version },
        ],
      };
    }

    // ── page mode (deprecated) — navigate to named page ──
    if (evtConfig.page) {
      if (this.logger) this.logger.warn({ message: "page event mode is deprecated, use navigate" });
      else
        console.warn(
          'AUP: "page" event mode is deprecated, use { target: "_root", set: { page: "..." } }',
        );
      return this._handlePageNavigation(evtConfig.page);
    }

    // ── navigate mode — client-side browser navigation, no-op on server ──
    if (evtConfig.navigate) {
      // navigate events are handled client-side (window.location.href).
      // If they reach the server (e.g. via _fireAupEvent), return the URL
      // so the client can act on it.
      return { returnValue: { navigate: evtConfig.navigate } };
    }

    // ── exec mode — call handler ──
    const execPath = evtConfig.exec;
    if (!execPath || typeof execPath !== "string") throw new Error("Event exec path is required");
    if (execPath.includes("..")) throw new Error("Event exec path cannot contain '..'");

    const args = { ...(evtConfig.args ?? {}), ...(data ?? {}) } as Record<string, unknown>;

    if (this.onExecEvent) {
      const result = await this.onExecEvent(nodeId, event, execPath, args);
      if (result !== undefined) return { returnValue: result };
    }

    return { returnValue: { nodeId, event, exec: execPath, args } };
  }

  // ==================== Page Navigation (shared by target _root + deprecated page mode) ====================

  /** Navigate to a named page via pageResolver. Used by target="_root" and deprecated page mode. */
  private async _handlePageNavigation(pageName: string): Promise<AUPDispatchResult> {
    if (!this.pageResolver) {
      throw new Error("No page resolver configured for page navigation");
    }
    const page = await this.pageResolver(pageName, this.locale);
    if (!page) {
      throw new Error(`Page not found: ${pageName}`);
    }
    const renderResult = this.render(page.tree, {
      fullPage: true,
      tone: page.tone ?? this.defaultTone,
      palette: page.palette ?? this.defaultPalette,
      page: pageName,
      locale: this.locale,
    });
    return {
      returnValue: { ok: true, page: pageName },
      broadcast: renderResult.broadcast,
    };
  }

  // ==================== Locale ====================

  /** Handle a locale change — re-render current page with new locale. */
  async handleLocaleChange(locale: string): Promise<AUPDispatchResult> {
    this.locale = locale;
    if (this.currentPage && this.pageResolver) {
      const page = await this.pageResolver(this.currentPage, locale);
      if (page) {
        return this.render(page.tree, {
          fullPage: true,
          tone: page.tone ?? this.defaultTone,
          palette: page.palette ?? this.defaultPalette,
          locale,
          page: this.currentPage,
        });
      }
    }
    // No current page to re-render — just acknowledge
    return { broadcast: [{ type: "aup", action: "locale", locale }] };
  }

  // ==================== Unified Dispatch ====================

  /**
   * Unified message dispatch — transport layer calls this single method.
   * DO/WsTransport: const result = logic.dispatch(JSON.parse(msg));
   */
  async dispatch(action: { action?: string; [key: string]: unknown }): Promise<AUPDispatchResult> {
    switch (action.action) {
      case "render":
        return this.render(action.root as AUPNode, action.options as AUPRenderOptions | undefined);
      case "patch":
        return this.patch(action.ops as AUPPatchOp[]);
      case "stage":
        return this.stage(
          action.sceneId as string,
          action.root as AUPNode,
          action.options as AUPRenderOptions | undefined,
        );
      case "take":
        return this.take(action.sceneId as string);
      case "event":
        return this.handleEvent(
          action.nodeId as string,
          action.event as string,
          action.data as Record<string, unknown> | undefined,
        );
      case "locale":
        return this.handleLocaleChange(action.locale as string);
      default:
        throw new Error(`Unknown AUP action: ${action.action}`);
    }
  }
}

// ── Helpers ──

/**
 * Resolve $args.* placeholders in a `set` object.
 * Works recursively on nested objects.
 */
function resolveSetArgs(
  template: Record<string, unknown>,
  eventData: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === "string" && value.startsWith("$args.")) {
      const field = value.slice(6);
      // Support dot-notation: $args.content.name resolves nested paths
      let resolved: unknown = eventData;
      for (const part of field.split(".")) {
        if (resolved == null || typeof resolved !== "object") {
          resolved = undefined;
          break;
        }
        resolved = (resolved as Record<string, unknown>)[part];
      }
      result[key] = resolved;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = resolveSetArgs(value as Record<string, unknown>, eventData);
    } else {
      result[key] = value;
    }
  }
  return result;
}
